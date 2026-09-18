/// <reference types="multer" />
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';
import { ScanService } from './scan.service';
import { ExtractionService } from './extraction.service';
import { ModerationService } from './moderation.service';
import { DocumentStatus, Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { AIService } from '../ai/ai.service';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = 'application/pdf';
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scan: ScanService,
    private readonly extraction: ExtractionService,
    private readonly moderation: ModerationService,
    private readonly ai: AIService,
  ) {}

  async uploadDocument(
    file: Express.Multer.File,
    uploader: User,
  ): Promise<{ id: string; status: DocumentStatus }> {
    if (uploader.role !== Role.SALES_MANAGER) {
      throw new ForbiddenException('Only Sales Managers can upload documents');
    }

    this.validateFile(file);

    const { key, url } = await this.storage.upload(file);

    let doc: Awaited<ReturnType<typeof this.prisma.document.create>>;
    try {
      doc = await this.prisma.document.create({
        data: {
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey: key,
          storageUrl: url,
          status: DocumentStatus.PENDING_SCAN,
          uploadedById: uploader.id,
        },
      });
    } catch (err) {
      // DB write failed after file was already uploaded — delete the orphaned file
      /* istanbul ignore next */
      void this.storage.delete(key).catch((deleteErr: unknown) =>
        this.logger.error({ key, deleteErr }, 'Failed to clean up orphaned file after DB error'),
      );
      throw err;
    }

    // Kick off async processing — does not block the HTTP response
    /* istanbul ignore next 3 */
    void this.processDocument(doc.id, file.buffer).catch((err: unknown) => {
      this.logger.error({ docId: doc.id, err }, 'Background processing failed');
    });

    return { id: doc.id, status: doc.status };
  }

  private validateFile(file: Express.Multer.File): void {
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException(
        `File too large — maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB`,
      );
    }
    if (file.mimetype !== ALLOWED_MIME) {
      throw new BadRequestException('Only PDF files are accepted');
    }
    if (!file.buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      throw new BadRequestException(
        'File content does not match a valid PDF (magic-byte check failed)',
      );
    }
  }

  private async processDocument(docId: string, buffer: Buffer): Promise<void> {
    await this.prisma.document.update({
      where: { id: docId },
      data: { status: DocumentStatus.SCANNING },
    });

    // 1. Malware scan
    const scanResult = await this.scan.scan(buffer);
    if (scanResult.infected) {
      await this.prisma.document.update({
        where: { id: docId },
        data: {
          status: DocumentStatus.REJECTED,
          rejectedReason: `Malware detected: ${scanResult.threat ?? 'unknown'}`,
        },
      });
      return;
    }

    // 2. Extract text — fail-open: image-based or malformed PDFs yield empty text
    // Manager can review the file manually at PENDING_REVIEW and reject if needed
    let text = '';
    try {
      text = await this.extraction.extractText(buffer);
    } catch (err) {
      this.logger.warn({ docId, err }, 'Text extraction failed — proceeding with empty text');
    }

    // 3. Moderation gate
    const modResult = await this.moderation.moderate(text);
    if (modResult.flagged) {
      await this.prisma.document.update({
        where: { id: docId },
        data: {
          status: DocumentStatus.REJECTED,
          rejectedReason: `Content policy violation: ${modResult.categories.join(', ')}`,
        },
      });
      return;
    }

    // 4. Store chunks
    const chunks = this.chunkText(text);
    await this.prisma.$transaction(
      chunks.map((content, idx) =>
        this.prisma.documentChunk.create({
          data: { documentId: docId, chunkIndex: idx, content },
        }),
      ),
    );

    await this.prisma.document.update({
      where: { id: docId },
      data: { status: DocumentStatus.PENDING_REVIEW },
    });
  }

  async approveDocument(docId: string, approver: User): Promise<DocumentType_> {
    if (approver.role !== Role.SALES_MANAGER) {
      throw new ForbiddenException('Only Sales Managers can approve documents');
    }
    const doc = await this.prisma.document.update({
      where: { id: docId },
      data: { status: DocumentStatus.READY },
    });

    // Kick off embedding generation asynchronously — does not block the response
    /* istanbul ignore next 3 */
    void this.ai.generateDocumentEmbeddings(docId).catch((err: unknown) => {
      this.logger.error({ docId, err }, 'Background embedding generation failed');
    });

    return doc;
  }

  async rejectDocument(
    docId: string,
    reason: string,
    rejecter: User,
  ): Promise<DocumentType_> {
    if (rejecter.role !== Role.SALES_MANAGER) {
      throw new ForbiddenException('Only Sales Managers can reject documents');
    }
    return this.prisma.document.update({
      where: { id: docId },
      data: { status: DocumentStatus.REJECTED, rejectedReason: reason },
    });
  }

  async deleteDocument(docId: string, deleter: User): Promise<void> {
    if (deleter.role !== Role.SALES_MANAGER) {
      throw new ForbiddenException('Only Sales Managers can delete documents');
    }
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return; // already gone — idempotent
    if (doc.status === DocumentStatus.SCANNING) {
      throw new BadRequestException(
        'Cannot delete a document while it is being scanned — try again in a moment',
      );
    }
    // Cascade in DB removes DocumentChunk rows; then remove the file from storage
    await this.prisma.document.delete({ where: { id: docId } });
    /* istanbul ignore next */
    void this.storage.delete(doc.storageKey).catch((err: unknown) =>
      this.logger.error({ docId, storageKey: doc.storageKey, err }, 'Storage delete failed after DB delete'),
    );
  }

  async hasReadyDocuments(): Promise<boolean> {
    const count = await this.prisma.document.count({
      where: { status: DocumentStatus.READY },
    });
    return count > 0;
  }

  async findAll(user: User) {
    if (user.role !== Role.SALES_MANAGER) {
      throw new ForbiddenException('Only Sales Managers can list documents');
    }
    return this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  private chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let i = 0;
    while (i < words.length) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
      i += chunkSize - overlap;
    }
    return chunks.filter((c) => c.trim().length > 0);
  }
}

// local alias to avoid circular import with entity file
type DocumentType_ = import('@prisma/client').Document;

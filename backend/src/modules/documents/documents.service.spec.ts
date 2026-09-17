import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentStatus, Role } from '@prisma/client';
import type { User } from '@prisma/client';
/// <reference types="multer" />
import type { StorageService } from './storage.service';
import type { ScanService } from './scan.service';
import type { ExtractionService } from './extraction.service';
import type { ModerationService } from './moderation.service';
import type { AIService } from '../ai/ai.service';

const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

const makePdfBuffer = (sizeBytes = 100): Buffer => {
  const buf = Buffer.alloc(sizeBytes, 0x20);
  PDF_HEADER.copy(buf);
  return buf;
};

const mockPrisma = {
  document: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  documentChunk: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockStorage: jest.Mocked<StorageService> = {
  upload: jest.fn(),
  delete: jest.fn(),
} as unknown as jest.Mocked<StorageService>;

const mockScan: jest.Mocked<ScanService> = {
  scan: jest.fn(),
} as unknown as jest.Mocked<ScanService>;

const mockExtraction: jest.Mocked<ExtractionService> = {
  extractText: jest.fn(),
} as unknown as jest.Mocked<ExtractionService>;

const mockModeration: jest.Mocked<ModerationService> = {
  moderate: jest.fn(),
} as unknown as jest.Mocked<ModerationService>;

const mockAI: jest.Mocked<Pick<AIService, 'generateDocumentEmbeddings'>> = {
  generateDocumentEmbeddings: jest.fn().mockResolvedValue(undefined),
};

const makeService = () =>
  new DocumentsService(
    mockPrisma as never,
    mockStorage,
    mockScan,
    mockExtraction,
    mockModeration,
    mockAI as never,
  );

const manager: User = {
  id: 'u-mgr',
  name: 'Manager',
  email: 'mgr@test.com',
  role: Role.SALES_MANAGER,
  password: 'hash',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const rep: User = {
  ...manager,
  id: 'u-rep',
  role: Role.SALES_REP,
  email: 'rep@test.com',
};

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 100,
  buffer: makePdfBuffer(100),
  stream: null as never,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

describe('DocumentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.upload.mockResolvedValue({ key: 'k/test.pdf', url: 'https://example.com/test.pdf' });
    mockPrisma.document.create.mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.PENDING_SCAN,
    });
    mockPrisma.document.update.mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.PENDING_REVIEW,
    });
    mockScan.scan.mockResolvedValue({ infected: false });
    mockExtraction.extractText.mockResolvedValue('Sample text content');
    mockModeration.moderate.mockResolvedValue({ flagged: false, categories: [] });
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  describe('uploadDocument', () => {
    it('rejects SALES_REP with ForbiddenException', async () => {
      const svc = makeService();
      await expect(svc.uploadDocument(makeFile(), rep)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects file larger than 20MB', async () => {
      const svc = makeService();
      const oversized = makeFile({ size: 21 * 1024 * 1024, buffer: makePdfBuffer(21 * 1024 * 1024) });
      await expect(svc.uploadDocument(oversized, manager)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-PDF mime type', async () => {
      const svc = makeService();
      const notPdf = makeFile({ mimetype: 'image/png' });
      await expect(svc.uploadDocument(notPdf, manager)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects file whose buffer does not start with %PDF', async () => {
      const svc = makeService();
      const fakePdf = makeFile({ buffer: Buffer.from('notapdf') });
      await expect(svc.uploadDocument(fakePdf, manager)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uploads a valid PDF and returns PENDING_SCAN status', async () => {
      const svc = makeService();
      const result = await svc.uploadDocument(makeFile(), manager);
      expect(result.status).toBe(DocumentStatus.PENDING_SCAN);
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    });

    it('deletes orphaned file from storage when DB create fails', async () => {
      mockPrisma.document.create.mockRejectedValue(new Error('DB connection lost'));
      mockStorage.delete.mockResolvedValue(undefined);
      const svc = makeService();
      await expect(svc.uploadDocument(makeFile(), manager)).rejects.toThrow('DB connection lost');
      // Give the void delete promise time to settle
      await new Promise((r) => setImmediate(r));
      expect(mockStorage.delete).toHaveBeenCalledWith('k/test.pdf');
    });
  });

  describe('approveDocument', () => {
    it('throws ForbiddenException for SALES_REP', async () => {
      const svc = makeService();
      await expect(svc.approveDocument('doc-1', rep)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates document status to READY for manager', async () => {
      mockPrisma.document.update.mockResolvedValue({ id: 'doc-1', status: DocumentStatus.READY });
      const svc = makeService();
      const result = await svc.approveDocument('doc-1', manager);
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: DocumentStatus.READY } }),
      );
      expect((result as { status: DocumentStatus }).status).toBe(DocumentStatus.READY);
    });

    it('triggers embedding generation after approval', async () => {
      mockPrisma.document.update.mockResolvedValue({ id: 'doc-1', status: DocumentStatus.READY });
      const svc = makeService();
      await svc.approveDocument('doc-1', manager);
      // Give the void promise time to settle
      await new Promise((r) => setImmediate(r));
      expect(mockAI.generateDocumentEmbeddings).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('rejectDocument', () => {
    it('throws ForbiddenException for SALES_REP', async () => {
      const svc = makeService();
      await expect(svc.rejectDocument('doc-1', 'bad content', rep)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates document status to REJECTED with reason', async () => {
      mockPrisma.document.update.mockResolvedValue({ id: 'doc-1', status: DocumentStatus.REJECTED });
      const svc = makeService();
      await svc.rejectDocument('doc-1', 'harmful content', manager);
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: DocumentStatus.REJECTED, rejectedReason: 'harmful content' },
        }),
      );
    });
  });

  describe('deleteDocument', () => {
    const docReady = {
      id: 'doc-1',
      status: DocumentStatus.READY,
      storageKey: 'uploads/doc-1.pdf',
    };

    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(docReady);
      mockPrisma.document.delete.mockResolvedValue(docReady);
      mockStorage.delete.mockResolvedValue(undefined);
    });

    it('throws ForbiddenException for SALES_REP', async () => {
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', rep)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns without error when document does not exist (idempotent)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when document is SCANNING', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ ...docReady, status: DocumentStatus.SCANNING });
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows deletion of PENDING_SCAN document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ ...docReady, status: DocumentStatus.PENDING_SCAN });
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('allows deletion of PENDING_REVIEW document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ ...docReady, status: DocumentStatus.PENDING_REVIEW });
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('allows deletion of READY document', async () => {
      const svc = makeService();
      await svc.deleteDocument('doc-1', manager);
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('calls storage.delete fire-and-forget after DB delete', async () => {
      const svc = makeService();
      await svc.deleteDocument('doc-1', manager);
      await new Promise((r) => setImmediate(r));
      expect(mockStorage.delete).toHaveBeenCalledWith('uploads/doc-1.pdf');
    });

    it('allows deletion of REJECTED document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ ...docReady, status: DocumentStatus.REJECTED });
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalled();
    });

    it('allows deletion of FAILED document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ ...docReady, status: DocumentStatus.FAILED });
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalled();
    });
  });

  describe('hasReadyDocuments', () => {
    it('returns true when count > 0', async () => {
      mockPrisma.document.count.mockResolvedValue(3);
      const svc = makeService();
      expect(await svc.hasReadyDocuments()).toBe(true);
    });

    it('returns false when count is 0', async () => {
      mockPrisma.document.count.mockResolvedValue(0);
      const svc = makeService();
      expect(await svc.hasReadyDocuments()).toBe(false);
    });

    it('queries only READY status', async () => {
      mockPrisma.document.count.mockResolvedValue(1);
      const svc = makeService();
      await svc.hasReadyDocuments();
      expect(mockPrisma.document.count).toHaveBeenCalledWith({
        where: { status: DocumentStatus.READY },
      });
    });
  });

  describe('findAll', () => {
    it('throws ForbiddenException for SALES_REP', async () => {
      const svc = makeService();
      await expect(svc.findAll(rep)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns all documents for manager', async () => {
      mockPrisma.document.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const svc = makeService();
      const result = await svc.findAll(manager);
      expect(result).toHaveLength(1);
    });
  });
});

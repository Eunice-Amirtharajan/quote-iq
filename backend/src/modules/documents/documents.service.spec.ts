import {
  ForbiddenException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
    updateMany: jest.fn(),
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
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const rep: User = {
  ...manager,
  id: 'u-rep',
  role: Role.SALES_REP,
  email: 'rep@test.com',
};

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
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
    mockStorage.upload.mockResolvedValue({
      key: 'k/test.pdf',
      url: 'https://example.com/test.pdf',
    });
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
    mockModeration.moderate.mockResolvedValue({
      flagged: false,
      categories: [],
    });
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  describe('uploadDocument', () => {
    it('rejects SALES_REP with ForbiddenException', async () => {
      const svc = makeService();
      await expect(svc.uploadDocument(makeFile(), rep)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects file larger than 20MB', async () => {
      const svc = makeService();
      const oversized = makeFile({
        size: 21 * 1024 * 1024,
        buffer: makePdfBuffer(21 * 1024 * 1024),
      });
      await expect(
        svc.uploadDocument(oversized, manager),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-PDF mime type', async () => {
      const svc = makeService();
      const notPdf = makeFile({ mimetype: 'image/png' });
      await expect(svc.uploadDocument(notPdf, manager)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects file whose buffer does not start with %PDF', async () => {
      const svc = makeService();
      const fakePdf = makeFile({ buffer: Buffer.from('notapdf') });
      await expect(svc.uploadDocument(fakePdf, manager)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('uploads a valid PDF and returns PENDING_SCAN status', async () => {
      const svc = makeService();
      const result = await svc.uploadDocument(makeFile(), manager);
      expect(result.status).toBe(DocumentStatus.PENDING_SCAN);
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    });

    it('deletes orphaned file from storage when DB create fails', async () => {
      mockPrisma.document.create.mockRejectedValue(
        new Error('DB connection lost'),
      );
      mockStorage.delete.mockResolvedValue(undefined);
      const svc = makeService();
      await expect(svc.uploadDocument(makeFile(), manager)).rejects.toThrow(
        'DB connection lost',
      );
      // Give the void delete promise time to settle
      await new Promise((r) => setImmediate(r));
      expect(mockStorage.delete).toHaveBeenCalledWith('k/test.pdf');
    });
  });

  describe('processDocument (background pipeline)', () => {
    const waitForBackground = () => new Promise<void>((r) => setImmediate(r));

    it('marks document REJECTED when scan returns infected', async () => {
      mockScan.scan.mockResolvedValue({ infected: true, threat: 'EICAR-Test' });
      mockPrisma.document.update.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.SCANNING,
      });
      const svc = makeService();
      await svc.uploadDocument(makeFile(), manager);
      await waitForBackground();
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DocumentStatus.REJECTED,
            rejectedReason: expect.stringContaining('EICAR-Test'),
          }),
        }),
      );
    });

    const lastFailedReason = (): string => {
      const failed = mockPrisma.document.update.mock.calls
        .map(
          ([arg]) =>
            arg as { data: { status: string; rejectedReason?: string } },
        )
        .filter((arg) => arg.data.status === DocumentStatus.FAILED);
      expect(failed).toHaveLength(1);
      return failed[0].data.rejectedReason ?? '';
    };

    it('marks document FAILED with a user-safe reason when the scan errors', async () => {
      mockScan.scan.mockRejectedValue(
        new Error('VIRUSTOTAL_API_KEY is not configured'),
      );
      const svc = makeService();
      await svc.uploadDocument(makeFile(), manager);
      await waitForBackground();
      await waitForBackground();
      const reason = lastFailedReason();
      expect(reason).toContain('The malware scan could not be completed');
      // The raw error can name env vars or file paths: logged, never shown
      expect(reason).not.toContain('VIRUSTOTAL_API_KEY');
    });

    it('marks document FAILED with a generic reason when a later step errors', async () => {
      mockPrisma.$transaction.mockRejectedValue(
        new Error(
          'Invalid `prisma.documentChunk.create()` invocation in /app/src/x.ts',
        ),
      );
      const svc = makeService();
      await svc.uploadDocument(makeFile(), manager);
      await waitForBackground();
      await waitForBackground();
      const reason = lastFailedReason();
      expect(reason).toMatch(/^Processing failed\./);
      expect(reason).not.toContain('prisma');
    });

    it('logs and still settles when marking the document FAILED fails too', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      mockScan.scan.mockRejectedValue(new Error('VirusTotal upload failed'));
      mockPrisma.document.update
        .mockResolvedValueOnce({ id: 'doc-1', status: DocumentStatus.SCANNING })
        .mockRejectedValueOnce(new Error('db down'));
      const svc = makeService();
      await svc.uploadDocument(makeFile(), manager);
      await waitForBackground();
      await waitForBackground();
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 'doc-1' }),
        'Could not mark document as FAILED',
      );
      logError.mockRestore();
    });

    it('proceeds with empty text when extraction throws', async () => {
      mockExtraction.extractText.mockRejectedValue(
        new Error('PDF parse error'),
      );
      const svc = makeService();
      await svc.uploadDocument(makeFile(), manager);
      await waitForBackground();
      // Moderation should still be called (with empty text)
      expect(mockModeration.moderate).toHaveBeenCalledWith('');
    });

    it('marks document REJECTED when moderation flags content', async () => {
      mockModeration.moderate.mockResolvedValue({
        flagged: true,
        categories: ['violence', 'hate'],
      });
      const svc = makeService();
      await svc.uploadDocument(makeFile(), manager);
      await waitForBackground();
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DocumentStatus.REJECTED,
            rejectedReason: expect.stringContaining('violence'),
          }),
        }),
      );
    });
  });

  describe('approveDocument', () => {
    it('throws ForbiddenException for SALES_REP', async () => {
      const svc = makeService();
      await expect(svc.approveDocument('doc-1', rep)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('updates a document awaiting review to READY for manager', async () => {
      mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.READY,
      });
      const svc = makeService();
      const result = await svc.approveDocument('doc-1', manager);
      expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
        where: { id: 'doc-1', status: DocumentStatus.PENDING_REVIEW },
        data: { status: DocumentStatus.READY },
      });
      expect(result.status).toBe(DocumentStatus.READY);
    });

    it('triggers embedding generation after approval', async () => {
      mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.READY,
      });
      const svc = makeService();
      await svc.approveDocument('doc-1', manager);
      // Give the void promise time to settle
      await new Promise((r) => setImmediate(r));
      expect(mockAI.generateDocumentEmbeddings).toHaveBeenCalledWith('doc-1');
    });

    it.each([
      DocumentStatus.FAILED,
      DocumentStatus.SCANNING,
      DocumentStatus.REJECTED,
      DocumentStatus.READY,
    ])(
      'refuses to approve a %s document, so unscanned text never reaches the RAG corpus',
      async (status) => {
        mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });
        mockPrisma.document.findUnique.mockResolvedValue({
          id: 'doc-1',
          status,
        });
        const svc = makeService();
        await expect(
          svc.approveDocument('doc-1', manager),
        ).rejects.toBeInstanceOf(BadRequestException);
        await new Promise((r) => setImmediate(r));
        expect(mockAI.generateDocumentEmbeddings).not.toHaveBeenCalled();
      },
    );

    it('throws NotFoundException for an unknown document', async () => {
      mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.document.findUnique.mockResolvedValue(null);
      const svc = makeService();
      await expect(svc.approveDocument('nope', manager)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('rejectDocument', () => {
    it('throws ForbiddenException for SALES_REP', async () => {
      const svc = makeService();
      await expect(
        svc.rejectDocument('doc-1', 'bad content', rep),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates a document awaiting review to REJECTED with reason', async () => {
      mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.REJECTED,
      });
      const svc = makeService();
      await svc.rejectDocument('doc-1', 'harmful content', manager);
      expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
        where: { id: 'doc-1', status: DocumentStatus.PENDING_REVIEW },
        data: {
          status: DocumentStatus.REJECTED,
          rejectedReason: 'harmful content',
        },
      });
    });

    it('refuses to reject a document that is not awaiting review', async () => {
      mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.READY,
      });
      const svc = makeService();
      await expect(
        svc.rejectDocument('doc-1', 'too late', manager),
      ).rejects.toBeInstanceOf(BadRequestException);
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
      await expect(svc.deleteDocument('doc-1', rep)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns without error when document does not exist (idempotent)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      const svc = makeService();
      await expect(
        svc.deleteDocument('doc-1', manager),
      ).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when document is SCANNING and scan started recently', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        ...docReady,
        status: DocumentStatus.SCANNING,
        updatedAt: new Date(), // just now — scan is active
      });
      const svc = makeService();
      await expect(svc.deleteDocument('doc-1', manager)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows deletion of SCANNING document when scan has been running for over 10 minutes (orphaned)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        ...docReady,
        status: DocumentStatus.SCANNING,
        updatedAt: new Date(Date.now() - 11 * 60 * 1000), // 11 min ago — stale
      });
      const svc = makeService();
      await expect(
        svc.deleteDocument('doc-1', manager),
      ).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('allows deletion of PENDING_SCAN document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        ...docReady,
        status: DocumentStatus.PENDING_SCAN,
      });
      const svc = makeService();
      await expect(
        svc.deleteDocument('doc-1', manager),
      ).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('allows deletion of PENDING_REVIEW document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        ...docReady,
        status: DocumentStatus.PENDING_REVIEW,
      });
      const svc = makeService();
      await expect(
        svc.deleteDocument('doc-1', manager),
      ).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('allows deletion of READY document', async () => {
      const svc = makeService();
      await svc.deleteDocument('doc-1', manager);
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('calls storage.delete fire-and-forget after DB delete', async () => {
      const svc = makeService();
      await svc.deleteDocument('doc-1', manager);
      await new Promise((r) => setImmediate(r));
      expect(mockStorage.delete).toHaveBeenCalledWith('uploads/doc-1.pdf');
    });

    it('allows deletion of REJECTED document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        ...docReady,
        status: DocumentStatus.REJECTED,
      });
      const svc = makeService();
      await expect(
        svc.deleteDocument('doc-1', manager),
      ).resolves.toBeUndefined();
      expect(mockPrisma.document.delete).toHaveBeenCalled();
    });

    it('allows deletion of FAILED document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        ...docReady,
        status: DocumentStatus.FAILED,
      });
      const svc = makeService();
      await expect(
        svc.deleteDocument('doc-1', manager),
      ).resolves.toBeUndefined();
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

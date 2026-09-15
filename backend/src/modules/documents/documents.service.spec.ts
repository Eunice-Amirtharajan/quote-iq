import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentStatus, Role } from '@prisma/client';
import type { User } from '@prisma/client';
/// <reference types="multer" />
import type { StorageService } from './storage.service';
import type { ScanService } from './scan.service';
import type { ExtractionService } from './extraction.service';
import type { ModerationService } from './moderation.service';

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

const makeService = () =>
  new DocumentsService(
    mockPrisma as never,
    mockStorage,
    mockScan,
    mockExtraction,
    mockModeration,
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

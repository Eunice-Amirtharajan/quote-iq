import { InternalServerErrorException } from '@nestjs/common';
/// <reference types="multer" />
import { StorageService } from './storage.service';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

const mockRemove = jest.fn();
const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockFrom = jest.fn(() => ({
  upload: mockUpload,
  createSignedUrl: mockCreateSignedUrl,
  remove: mockRemove,
}));

const mockSupabaseClient = { storage: { from: mockFrom } };

describe('StorageService', () => {
  let service: StorageService;

  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService();
  });

  describe('upload', () => {
    it('returns key and signed url on success', async () => {
      mockUpload.mockResolvedValue({ data: {}, error: null });
      mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://supabase.co/signed/file.pdf' }, error: null });

      const file = {
        originalname: 'test.pdf',
        buffer: Buffer.from('pdf'),
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await service.upload(file);

      expect(result.url).toBe('https://supabase.co/signed/file.pdf');
      expect(result.key).toContain('test.pdf');
    });

    it('throws InternalServerErrorException on Supabase upload error', async () => {
      mockUpload.mockResolvedValue({ data: null, error: new Error('bucket not found') });

      const file = {
        originalname: 'bad.pdf',
        buffer: Buffer.from('pdf'),
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(service.upload(file)).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when signed URL generation fails', async () => {
      mockUpload.mockResolvedValue({ data: {}, error: null });
      mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error('signing failed') });

      const file = {
        originalname: 'test.pdf',
        buffer: Buffer.from('pdf'),
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(service.upload(file)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('getSignedUrl', () => {
    it('returns a signed url for an existing key', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://supabase.co/signed/existing.pdf' }, error: null });
      const url = await service.getSignedUrl('some/key.pdf');
      expect(url).toBe('https://supabase.co/signed/existing.pdf');
    });

    it('throws InternalServerErrorException when signing fails', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error('not found') });
      await expect(service.getSignedUrl('missing/key.pdf')).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('delete', () => {
    it('calls supabase remove and does not throw on success', async () => {
      mockRemove.mockResolvedValue({ error: null });
      await expect(service.delete('some/key.pdf')).resolves.toBeUndefined();
      expect(mockRemove).toHaveBeenCalledWith(['some/key.pdf']);
    });

    it('logs a warning but does not throw on delete error', async () => {
      mockRemove.mockResolvedValue({ error: new Error('not found') });
      await expect(service.delete('missing/key.pdf')).resolves.toBeUndefined();
    });
  });
});

import { InternalServerErrorException } from '@nestjs/common';
import { ScanService } from './scan.service';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('ScanService', () => {
  let service: ScanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScanService();
  });

  describe('scan — VIRUSTOTAL_API_KEY not set', () => {
    it('throws InternalServerErrorException when key is missing', async () => {
      delete process.env.VIRUSTOTAL_API_KEY;
      await expect(service.scan(Buffer.from('file'))).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('scan — VirusTotal upload fails', () => {
    it('throws InternalServerErrorException when VT upload returns non-ok', async () => {
      process.env.VIRUSTOTAL_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as typeof fetch;

      await expect(service.scan(Buffer.from('file'))).rejects.toThrow(
        InternalServerErrorException,
      );
      delete process.env.VIRUSTOTAL_API_KEY;
    });
  });

  describe('scan — VirusTotal clean file', () => {
    it('returns not infected when analysis reports 0 malicious', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      process.env.VIRUSTOTAL_API_KEY = 'test-key';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: 'analysis-123' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { attributes: { status: 'completed', stats: { malicious: 0 } } },
          }),
        } as Response) as typeof fetch;

      const result = await service.scan(Buffer.from('clean'));
      expect(result.infected).toBe(false);
      expect(result.threat).toBeUndefined();
      delete process.env.VIRUSTOTAL_API_KEY;
      jest.restoreAllMocks();
    });
  });

  describe('scan — VirusTotal infected file', () => {
    it('returns infected when analysis reports malicious > 0', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      process.env.VIRUSTOTAL_API_KEY = 'test-key';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: 'analysis-123' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { attributes: { status: 'completed', stats: { malicious: 3 } } },
          }),
        } as Response) as typeof fetch;

      const result = await service.scan(Buffer.from('malware'));
      expect(result.infected).toBe(true);
      expect(result.threat).toBe('VirusTotal detection');
      delete process.env.VIRUSTOTAL_API_KEY;
      jest.restoreAllMocks();
    });
  });

  describe('scan — VirusTotal analysis times out', () => {
    it('throws InternalServerErrorException when all 12 polls return queued status', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      process.env.VIRUSTOTAL_API_KEY = 'test-key';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: 'analysis-123' } }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            data: { attributes: { status: 'queued', stats: { malicious: 0 } } },
          }),
        } as Response) as typeof fetch;

      await expect(service.scan(Buffer.from('file'))).rejects.toThrow(
        'Malware scan timed out — upload blocked',
      );
      delete process.env.VIRUSTOTAL_API_KEY;
      jest.restoreAllMocks();
    }, 15000);
  });
});

import { ScanService } from './scan.service';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }));
jest.mock('node:fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function makeProc(stdout: string, exitCode: number) {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: jest.fn(),
  });
  setImmediate(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.stderr.emit('data', Buffer.from(''));
    proc.emit('close', exitCode);
  });
  return proc;
}

describe('ScanService', () => {
  let service: ScanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScanService();
  });

  describe('scan — ClamAV available', () => {
    it('returns not infected when clamdscan exits 0 with OK', async () => {
      mockSpawn
        .mockReturnValueOnce(makeProc('', 0))                        // docker cp
        .mockReturnValueOnce(makeProc('/tmp/f.pdf: OK', 0))          // clamdscan clean
        .mockReturnValueOnce(makeProc('', 0));                       // docker exec rm
      const result = await service.scan(Buffer.from('clean'));
      expect(result.infected).toBe(false);
    });

    it('returns infected with threat when clamdscan exits 1 (FOUND)', async () => {
      mockSpawn
        .mockReturnValueOnce(makeProc('', 0))                                         // docker cp
        .mockReturnValueOnce(makeProc('/tmp/f.pdf: Eicar-Test-Signature FOUND', 1))   // clamdscan infected
        .mockReturnValueOnce(makeProc('', 0));                                        // docker exec rm
      const result = await service.scan(Buffer.from('eicar'));
      expect(result.infected).toBe(true);
      expect(result.threat).toContain('Eicar-Test-Signature');
    });
  });

  describe('scan — ClamAV exec timeout', () => {
    it('kills process and falls back when exec hangs past timeout', async () => {
      // Capture the setTimeout callback so we can fire it immediately
      let timeoutCb: (() => void) | null = null;
      jest.spyOn(global, 'setTimeout').mockImplementationOnce((cb: () => void) => {
        timeoutCb = cb;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: jest.fn(),
      });
      mockSpawn.mockReturnValue(proc);
      delete process.env.VIRUSTOTAL_API_KEY;

      const scanPromise = service.scan(Buffer.from('file'));
      // Allow the exec() call to register its setTimeout, then fire it
      await Promise.resolve();
      timeoutCb?.();

      const result = await scanPromise;
      expect(result.infected).toBe(false);
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
      jest.restoreAllMocks();
    });
  });

  describe('scan — child process error event', () => {
    it('falls back when spawn emits error (e.g. docker not found)', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: jest.fn(),
      });
      // Emit synchronously after spawn — setImmediate ensures it fires after the Promise chain registers
      setImmediate(() => proc.emit('error', new Error('spawn docker ENOENT')));
      mockSpawn.mockReturnValue(proc);
      delete process.env.VIRUSTOTAL_API_KEY;

      const result = await service.scan(Buffer.from('file'));
      expect(result.infected).toBe(false);
    });
  });

  describe('scan — ClamAV unavailable, VirusTotal fallback', () => {
    // Use makeProc('', 2) — docker cp exits non-0, triggering ClamAV error → VT fallback
    it('falls back gracefully when docker cp fails and VIRUSTOTAL_API_KEY not set', async () => {
      mockSpawn.mockReturnValueOnce(makeProc('', 2));
      delete process.env.VIRUSTOTAL_API_KEY;
      const result = await service.scan(Buffer.from('file'));
      expect(result.infected).toBe(false);
    });

    it('returns clean when VirusTotal upload fails', async () => {
      mockSpawn.mockReturnValueOnce(makeProc('', 2));
      process.env.VIRUSTOTAL_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as typeof fetch;

      const result = await service.scan(Buffer.from('file'));
      expect(result.infected).toBe(false);
      delete process.env.VIRUSTOTAL_API_KEY;
    });

    it('returns infected when VirusTotal analysis reports malicious', async () => {
      // Speed up the 5000ms poll delay
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      mockSpawn.mockReturnValueOnce(makeProc('', 2));
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

    it('returns clean when VirusTotal analysis times out (12 polls)', async () => {
      // Speed up the 5000ms poll delay to run immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      mockSpawn.mockReturnValueOnce(makeProc('', 2));
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

      const result = await service.scan(Buffer.from('file'));
      expect(result.infected).toBe(false);
      delete process.env.VIRUSTOTAL_API_KEY;
      jest.restoreAllMocks();
    }, 15000);
  });
});

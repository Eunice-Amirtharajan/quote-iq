import { ScanService } from './scan.service';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }));
jest.mock('node:fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

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

  describe('scan — ClamAV unavailable, VirusTotal fallback', () => {
    it('falls back gracefully when docker cp fails and VIRUSTOTAL_API_KEY not set', async () => {
      // exit code 2 = docker not available / container missing → triggers fallback
      mockSpawn
        .mockReturnValueOnce(makeProc('', 2));   // docker cp fails
      delete process.env.VIRUSTOTAL_API_KEY;
      const result = await service.scan(Buffer.from('file'));
      expect(result.infected).toBe(false);
    });
  });
});

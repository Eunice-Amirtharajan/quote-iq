import { ScanService } from './scan.service';
import * as net from 'node:net';

jest.mock('node:net');

const mockSocket = {
  setTimeout: jest.fn(),
  connect: jest.fn(),
  write: jest.fn(),
  on: jest.fn(),
  destroy: jest.fn(),
};

(net.Socket as jest.Mock).mockImplementation(() => mockSocket);

const simulateClamd = (response: string) => {
  let connectCb: () => void;
  let dataCb: (chunk: Buffer) => void;
  let endCb: () => void;

  mockSocket.connect.mockImplementation((_port: number, _host: string, cb: () => void) => {
    connectCb = cb;
  });
  mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'data') dataCb = cb as (chunk: Buffer) => void;
    if (event === 'end') endCb = cb;
  });

  // Simulate async ClamD response
  setImmediate(() => {
    connectCb();
    dataCb(Buffer.from(response));
    endCb();
  });
};

describe('ScanService', () => {
  let service: ScanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScanService();
    // Reset mock implementations
    (net.Socket as jest.Mock).mockImplementation(() => mockSocket);
  });

  describe('scan — ClamAV available', () => {
    it('returns not infected when ClamAV responds OK', async () => {
      simulateClamd('stream: OK');
      const result = await service.scan(Buffer.from('clean-file'));
      expect(result.infected).toBe(false);
    });

    it('returns infected with threat name when ClamAV finds malware', async () => {
      simulateClamd('stream: Eicar-Test-Signature FOUND');
      const result = await service.scan(Buffer.from('eicar'));
      expect(result.infected).toBe(true);
      expect(result.threat).toContain('Eicar-Test-Signature');
    });
  });

  describe('scan — ClamAV unavailable, VirusTotal fallback', () => {
    it('falls back gracefully and returns not infected when VIRUSTOTAL_API_KEY is not set', async () => {
      // Socket emits error → ClamAV fails → fallback to VT
      mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'error') setImmediate(() => (cb as (e: Error) => void)(new Error('ECONNREFUSED')));
      });
      mockSocket.connect.mockImplementation(() => {});

      delete process.env.VIRUSTOTAL_API_KEY;

      const result = await service.scan(Buffer.from('file'));
      expect(result.infected).toBe(false);
    });
  });
});

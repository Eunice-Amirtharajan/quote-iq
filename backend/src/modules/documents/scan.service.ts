import { Injectable, Logger } from '@nestjs/common';
import * as net from 'node:net';

export interface ScanResult {
  infected: boolean;
  threat?: string;
}

const CLAMD_HOST = process.env.CLAMD_HOST ?? '127.0.0.1';
const CLAMD_PORT = parseInt(process.env.CLAMD_PORT ?? '3310', 10);
const CLAMD_TIMEOUT_MS = 10_000;

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  async scan(buffer: Buffer): Promise<ScanResult> {
    try {
      return await this.scanWithClamd(buffer);
    } catch (err) {
      this.logger.warn({ err }, 'ClamAV unavailable — falling back to VirusTotal');
      return this.scanWithVirusTotal(buffer);
    }
  }

  private scanWithClamd(buffer: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];

      socket.setTimeout(CLAMD_TIMEOUT_MS);
      socket.connect(CLAMD_PORT, CLAMD_HOST, () => {
        // INSTREAM protocol: prefix each chunk with 4-byte big-endian length
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(buffer.length, 0);
        socket.write('zINSTREAM\0');
        socket.write(size);
        socket.write(buffer);
        // Terminate stream
        socket.write(Buffer.alloc(4));
      });

      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => {
        const response = Buffer.concat(chunks).toString().trim();
        socket.destroy();
        if (response.includes('FOUND')) {
          const threat = response.split('FOUND')[0].trim().split(':').pop()?.trim();
          resolve({ infected: true, threat });
        } else {
          resolve({ infected: false });
        }
      });
      socket.on('timeout', () => { socket.destroy(); reject(new Error('ClamAV timeout')); });
      socket.on('error', (err) => { socket.destroy(); reject(err); });
    });
  }

  private async scanWithVirusTotal(buffer: Buffer): Promise<ScanResult> {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) {
      this.logger.warn('VIRUSTOTAL_API_KEY not set — skipping malware scan');
      return { infected: false };
    }

    const form = new FormData();
    // Buffer.from() produces an ArrayBuffer-backed buffer, satisfying the BlobPart constraint
    const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    form.append('file', new Blob([arrayBuf]), 'upload.pdf');

    const uploadRes = await fetch('https://www.virustotal.com/api/v3/files', {
      method: 'POST',
      headers: { 'x-apikey': apiKey },
      body: form,
    });
    if (!uploadRes.ok) {
      this.logger.error({ status: uploadRes.status }, 'VirusTotal upload failed');
      return { infected: false };
    }

    const { data } = (await uploadRes.json()) as { data: { id: string } };
    // Poll for analysis result (up to 60s)
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const analysisRes = await fetch(`https://www.virustotal.com/api/v3/analyses/${data.id}`, {
        headers: { 'x-apikey': apiKey },
      });
      if (!analysisRes.ok) continue;
      const analysis = (await analysisRes.json()) as {
        data: { attributes: { status: string; stats: { malicious: number } } };
      };
      if (analysis.data.attributes.status === 'completed') {
        const malicious = analysis.data.attributes.stats.malicious;
        return { infected: malicious > 0, threat: malicious > 0 ? 'VirusTotal detection' : undefined };
      }
    }

    this.logger.warn('VirusTotal analysis timed out — treating as clean');
    return { infected: false };
  }
}

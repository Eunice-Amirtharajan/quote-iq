import { Injectable, Logger } from '@nestjs/common';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';

export interface ScanResult {
  infected: boolean;
  threat?: string;
}

const CLAMD_CONTAINER = process.env.CLAMD_CONTAINER ?? 'quoteiq-clamav';
const CLAMD_TIMEOUT_MS = parseInt(process.env.CLAMD_TIMEOUT_MS ?? '30000', 10);

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  async scan(buffer: Buffer): Promise<ScanResult> {
    this.logger.log({ bytes: buffer.length }, 'Starting malware scan');
    try {
      return await this.scanWithClamd(buffer);
    } catch (err) {
      this.logger.warn({ err }, 'ClamAV unavailable — falling back to VirusTotal');
      return this.scanWithVirusTotal(buffer);
    }
  }

  private async scanWithClamd(buffer: Buffer): Promise<ScanResult> {
    // Write buffer to a host temp file, copy into container, scan, then clean up
    const tmpName = `clamd-${crypto.randomUUID()}.pdf`;
    const tmpHost = path.join(os.tmpdir(), tmpName);
    const tmpContainer = `/tmp/${tmpName}`;

    await fs.writeFile(tmpHost, buffer);

    try {
      // Copy file into container
      await this.exec('docker', ['cp', tmpHost, `${CLAMD_CONTAINER}:${tmpContainer}`], 10_000);

      // Run clamdscan inside container
      let stdout = '';
      let stderr = '';
      try {
        stdout = await this.exec(
          'docker',
          ['exec', CLAMD_CONTAINER, 'clamdscan', '--no-summary', tmpContainer],
          CLAMD_TIMEOUT_MS,
        );
      } catch (err: unknown) {
        // clamdscan exits 1 when FOUND — capture stdout from the error
        const e = err as { stdout?: string; stderr?: string; code?: number };
        stdout = e.stdout ?? '';
        stderr = e.stderr ?? '';
        if (e.code !== 1) throw err; // exit 1 = virus found, anything else = real error
      }

      this.logger.log({ stdout: stdout.trim() }, 'clamdscan result');

      if (stdout.includes('FOUND')) {
        const threat = stdout.split('FOUND')[0].trim().split(':').pop()?.trim();
        return { infected: true, threat };
      }
      return { infected: false };
    } finally {
      // Clean up temp files (best-effort)
      void fs.unlink(tmpHost).catch(() => null);
      void this.exec('docker', ['exec', CLAMD_CONTAINER, 'rm', '-f', tmpContainer], 5_000).catch(() => null);
    }
  }

  private exec(cmd: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`));
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          const err = Object.assign(new Error(`Command exited ${code}: ${stderr.trim()}`), { code, stdout, stderr });
          reject(err);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async scanWithVirusTotal(buffer: Buffer): Promise<ScanResult> {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) {
      this.logger.warn('VIRUSTOTAL_API_KEY not set — skipping malware scan');
      return { infected: false };
    }

    const form = new FormData();
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

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

export interface ScanResult {
  infected: boolean;
  threat?: string;
}

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  async scan(buffer: Buffer): Promise<ScanResult> {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'VIRUSTOTAL_API_KEY is not configured — document uploads are disabled',
      );
    }

    this.logger.log({ bytes: buffer.length }, 'Starting VirusTotal malware scan');

    const form = new FormData();
    const arrayBuf = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    form.append('file', new Blob([arrayBuf]), 'upload.pdf');

    const uploadRes = await fetch('https://www.virustotal.com/api/v3/files', {
      method: 'POST',
      headers: { 'x-apikey': apiKey },
      body: form,
    });

    if (!uploadRes.ok) {
      this.logger.error({ status: uploadRes.status }, 'VirusTotal upload failed');
      throw new InternalServerErrorException('Malware scan failed — upload to VirusTotal rejected');
    }

    const { data } = (await uploadRes.json()) as { data: { id: string } };

    // Poll up to 60 s (12 × 5 s) for the analysis to complete
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const analysisRes = await fetch(
        `https://www.virustotal.com/api/v3/analyses/${data.id}`,
        { headers: { 'x-apikey': apiKey } },
      );
      if (!analysisRes.ok) continue;

      const analysis = (await analysisRes.json()) as {
        data: { attributes: { status: string; stats: { malicious: number } } };
      };

      if (analysis.data.attributes.status === 'completed') {
        const malicious = analysis.data.attributes.stats.malicious;
        this.logger.log({ malicious, analysisId: data.id }, 'VirusTotal analysis complete');
        return {
          infected: malicious > 0,
          threat: malicious > 0 ? 'VirusTotal detection' : undefined,
        };
      }
    }

    this.logger.warn({ analysisId: data.id }, 'VirusTotal analysis timed out — treating as clean');
    return { infected: false };
  }
}

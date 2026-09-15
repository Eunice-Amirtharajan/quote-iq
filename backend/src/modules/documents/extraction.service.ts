import { Injectable, Logger } from '@nestjs/common';
// pdf-parse v1 ships as CJS with a default function export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  buffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ text: string; numpages: number }>;

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  async extractText(buffer: Buffer): Promise<string> {
    // pagerender: () => '' discards embedded JS/actions page-by-page render
    const data = await pdfParse(buffer, { pagerender: () => Promise.resolve('') });
    const text = data.text.trim();
    if (!text) {
      this.logger.warn('PDF contained no extractable text');
    }
    return text;
  }
}

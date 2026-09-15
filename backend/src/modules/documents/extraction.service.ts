import { Injectable, Logger } from '@nestjs/common';

// pdfjs-dist legacy build is required for Node.js environments
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs') as {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PDFDocumentProxy> };
};

interface PDFDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<{ items: Array<{ str: string }> }>;
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  async extractText(buffer: Buffer): Promise<string> {
    const data = new Uint8Array(buffer);
    const doc = await getDocument({ data }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    }

    const text = pages.join('\n').trim();
    if (!text) {
      this.logger.warn('PDF contained no extractable text');
    }
    return text;
  }
}

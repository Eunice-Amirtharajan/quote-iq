import { ExtractionService } from './extraction.service';

jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({ text: '  Sample extracted text  ', numpages: 1 }),
);

import pdfParse from 'pdf-parse';

describe('ExtractionService', () => {
  let service: ExtractionService;

  beforeEach(() => {
    service = new ExtractionService();
    jest.clearAllMocks();
  });

  it('returns trimmed text from pdf-parse', async () => {
    const result = await service.extractText(Buffer.from('fake-pdf'));
    expect(result).toBe('Sample extracted text');
    expect(pdfParse).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ pagerender: expect.any(Function) }));
  });

  it('returns empty string and logs when pdf has no text', async () => {
    (pdfParse as jest.Mock).mockResolvedValueOnce({ text: '   ', numpages: 1 });
    const result = await service.extractText(Buffer.from('empty-pdf'));
    expect(result).toBe('');
  });
});

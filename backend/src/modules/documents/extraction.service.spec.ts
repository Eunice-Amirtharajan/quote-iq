import { ExtractionService } from './extraction.service';

const mockGetTextContent = jest.fn();
const mockGetPage = jest.fn().mockResolvedValue({ getTextContent: mockGetTextContent });
const mockPdfDoc = { numPages: 2, getPage: mockGetPage };
const mockGetDocument = jest.fn().mockReturnValue({ promise: Promise.resolve(mockPdfDoc) });

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));

describe('ExtractionService', () => {
  let service: ExtractionService;

  beforeEach(() => {
    service = new ExtractionService();
    jest.clearAllMocks();
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdfDoc) });
    mockGetPage.mockResolvedValue({ getTextContent: mockGetTextContent });
  });

  it('extracts and trims text from all pages', async () => {
    mockGetTextContent
      .mockResolvedValueOnce({ items: [{ str: 'Hello ' }, { str: 'World' }] })
      .mockResolvedValueOnce({ items: [{ str: 'Page two' }] });

    const result = await service.extractText(Buffer.from('%PDF-fake'));
    expect(result).toBe('Hello  World\nPage two');
    expect(mockGetDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
  });

  it('returns empty string and logs when PDF has no text', async () => {
    mockGetTextContent
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });

    const result = await service.extractText(Buffer.from('%PDF-empty'));
    expect(result).toBe('');
  });
});

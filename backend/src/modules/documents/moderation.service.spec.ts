import { ModerationService } from './moderation.service';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    moderations: { create: mockCreate },
  })),
}));

describe('ModerationService', () => {
  let service: ModerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ModerationService();
  });

  it('returns not flagged for empty text without calling API', async () => {
    const result = await service.moderate('');
    expect(result).toEqual({ flagged: false, categories: [] });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns not flagged when OpenAI says clean', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: false, categories: { hate: false, violence: false } }],
    });
    const result = await service.moderate('Normal business document');
    expect(result.flagged).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it('returns flagged categories when OpenAI flags content', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { hate: true, violence: false } }],
    });
    const result = await service.moderate('Hateful content here');
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('hate');
  });

  it('returns not flagged and does not throw when API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('OpenAI down'));
    const result = await service.moderate('Some text');
    expect(result.flagged).toBe(false);
  });

  it('returns not flagged when API returns no results', async () => {
    mockCreate.mockResolvedValue({ results: [] });
    const result = await service.moderate('Some text');
    expect(result.flagged).toBe(false);
  });
});

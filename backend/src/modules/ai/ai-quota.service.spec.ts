import { HttpException, HttpStatus } from '@nestjs/common';
import { AiQuotaService, currentAiUser, runAsAiUser } from './ai-quota.service';

const mockPrisma = {
  aiUsage: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
};
const mockLogger = { warn: jest.fn() };
const mockRejections = { inc: jest.fn() };
const newService = () =>
  new AiQuotaService(
    mockPrisma as never,
    mockLogger as never,
    mockRejections as never,
  );

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => e as HttpException,
  );

const thrown = (fn: () => void): HttpException | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e as HttpException;
  }
};

describe('AiQuotaService', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    jest.useRealTimers();
    jest.clearAllMocks();
    mockPrisma.aiUsage.findUnique.mockResolvedValue(null);
  });

  describe('per-minute rate', () => {
    it('allows 20 AI requests a minute per user, then answers 429 with the wait', () => {
      jest.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
      const quota = newService();
      for (let i = 0; i < 20; i++) quota.assertRate('u-1');
      jest.advanceTimersByTime(15_000);

      const err = thrown(() => quota.assertRate('u-1'));

      expect(err).toBeInstanceOf(HttpException);
      expect(err?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err?.message).toBe('Too many AI requests. Try again in 45s.');
      expect(mockRejections.inc).toHaveBeenCalledWith({ reason: 'rate' });
    });

    it('opens a new window after a minute', () => {
      jest.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
      const quota = newService();
      for (let i = 0; i < 20; i++) quota.assertRate('u-1');
      jest.advanceTimersByTime(60_000);
      expect(thrown(() => quota.assertRate('u-1'))).toBeUndefined();
    });

    it('counts each user separately', () => {
      const quota = newService();
      for (let i = 0; i < 20; i++) quota.assertRate('u-1');
      expect(thrown(() => quota.assertRate('u-2'))).toBeUndefined();
    });

    it('reads the limit from AI_REQUESTS_PER_MINUTE, ignoring invalid values', () => {
      process.env.AI_REQUESTS_PER_MINUTE = '2';
      const quota = newService();
      quota.assertRate('u-1');
      quota.assertRate('u-1');
      expect(thrown(() => quota.assertRate('u-1'))).toBeInstanceOf(
        HttpException,
      );

      process.env.AI_REQUESTS_PER_MINUTE = 'lots';
      const fallback = newService();
      for (let i = 0; i < 20; i++) fallback.assertRate('u-1');
      expect(thrown(() => fallback.assertRate('u-1'))).toBeInstanceOf(
        HttpException,
      );
    });

    it('never reads the token budget', () => {
      newService().assertRate('u-1');
      expect(mockPrisma.aiUsage.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('daily token budget', () => {
    const asUser = (quota: AiQuotaService) =>
      runAsAiUser('u-1', () => quota.assertBudget());

    it("looks up today's usage (UTC) for the user the request runs for", async () => {
      jest.useFakeTimers({ now: Date.parse('2026-10-27T23:30:00Z') });
      await asUser(newService());
      expect(mockPrisma.aiUsage.findUnique).toHaveBeenCalledWith({
        where: {
          userId_day: { userId: 'u-1', day: new Date('2026-10-27T00:00:00Z') },
        },
      });
    });

    it('answers 429 once the user has spent the budget', async () => {
      mockPrisma.aiUsage.findUnique.mockResolvedValue({ tokens: 200_000 });
      const err = await rejection(asUser(newService()));
      expect(err?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err?.message).toBe(
        "You've reached today's AI limit. It resets at midnight UTC.",
      );
      expect(mockRejections.inc).toHaveBeenCalledWith({ reason: 'budget' });
    });

    it('allows requests below the budget, which AI_DAILY_TOKEN_BUDGET overrides', async () => {
      mockPrisma.aiUsage.findUnique.mockResolvedValue({ tokens: 199_999 });
      await expect(asUser(newService())).resolves.toBeUndefined();

      process.env.AI_DAILY_TOKEN_BUDGET = '1000';
      mockPrisma.aiUsage.findUnique.mockResolvedValue({ tokens: 1000 });
      expect(await rejection(asUser(newService()))).toBeInstanceOf(
        HttpException,
      );
    });

    it('reads the budget once per request, however many AI calls it makes', async () => {
      const quota = newService();
      await runAsAiUser('u-1', async () => {
        await quota.assertBudget(); // embedding
        await quota.assertBudget(); // rerank
        await quota.assertBudget(); // answer
      });
      expect(mockPrisma.aiUsage.findUnique).toHaveBeenCalledTimes(1);

      await asUser(quota); // the next request checks again
      expect(mockPrisma.aiUsage.findUnique).toHaveBeenCalledTimes(2);
    });

    it('does nothing outside a user request (background work is not charged)', async () => {
      await expect(newService().assertBudget()).resolves.toBeUndefined();
      expect(mockPrisma.aiUsage.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('record', () => {
    it("adds the tokens to the user's total for today", async () => {
      jest.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
      await newService().record('u-1', 775);
      const day = new Date('2026-10-27T00:00:00Z');
      expect(mockPrisma.aiUsage.upsert).toHaveBeenCalledWith({
        where: { userId_day: { userId: 'u-1', day } },
        create: { userId: 'u-1', day, tokens: 775 },
        update: { tokens: { increment: 775 } },
      });
    });

    it('skips calls that used no tokens', async () => {
      await newService().record('u-1', 0);
      expect(mockPrisma.aiUsage.upsert).not.toHaveBeenCalled();
    });

    it('logs instead of failing when the usage cannot be stored', async () => {
      mockPrisma.aiUsage.upsert.mockRejectedValueOnce(new Error('db busy'));
      await expect(newService().record('u-1', 10)).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('AI usage not recorded for user u-1'),
        AiQuotaService.name,
      );
    });
  });

  it('carries the AI user through async work', async () => {
    expect(currentAiUser()).toBeUndefined();
    const seen = await runAsAiUser('u-9', async () => {
      await Promise.resolve();
      return currentAiUser();
    });
    expect(seen).toBe('u-9');
  });
});

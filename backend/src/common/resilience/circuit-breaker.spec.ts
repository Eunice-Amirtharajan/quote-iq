import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

class ClientError extends Error {}

const onStateChange = jest.fn();
const onReject = jest.fn();
const ok = () => Promise.resolve('ok');
const down = () => Promise.reject(new Error('503 Service Unavailable'));
const badRequest = () => Promise.reject(new ClientError('400 bad prompt'));

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  const fail = (times: number) =>
    Promise.all(
      Array.from({ length: times }, () =>
        breaker.execute(down).catch(() => undefined),
      ),
    );

  beforeEach(() => {
    jest.useFakeTimers();
    breaker = new CircuitBreaker({
      name: 'Groq',
      failureThreshold: 3,
      openMs: 30_000,
      isFailure: (err) => !(err instanceof ClientError),
      onStateChange,
      onReject,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('passes results and errors through while closed', async () => {
    await expect(breaker.execute(ok)).resolves.toBe('ok');
    await expect(breaker.execute(down)).rejects.toThrow('503');
    expect(breaker.currentState).toBe('closed');
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('opens after the threshold of consecutive failures', async () => {
    await fail(3);
    expect(breaker.currentState).toBe('open');
    expect(onStateChange).toHaveBeenCalledWith('open');
  });

  it('resets the failure count after a success', async () => {
    await fail(2);
    await breaker.execute(ok);
    await fail(2);
    expect(breaker.currentState).toBe('closed');
  });

  it('does not count errors the downstream answered with, and rethrows them', async () => {
    await fail(2);
    await expect(breaker.execute(badRequest)).rejects.toThrow(ClientError);
    await fail(2);
    expect(breaker.currentState).toBe('closed');
  });

  it('fails fast without calling the downstream while open', async () => {
    await fail(3);
    jest.advanceTimersByTime(10_000);
    const fn = jest.fn(ok);

    const err = await breaker.execute(fn).catch((e: unknown) => e);

    expect(fn).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect((err as CircuitOpenError).retryAfterMs).toBe(20_000);
    expect((err as CircuitOpenError).message).toBe(
      'Groq is temporarily unavailable, try again in 20s',
    );
    expect((err as CircuitOpenError).getStatus()).toBe(503);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('closes when the half-open trial call succeeds', async () => {
    await fail(3);
    jest.advanceTimersByTime(30_000);

    await expect(breaker.execute(ok)).resolves.toBe('ok');

    expect(onStateChange.mock.calls.map(([s]) => s as string)).toEqual([
      'open',
      'half_open',
      'closed',
    ]);
  });

  it('treats a half-open trial answered with a client error as healthy', async () => {
    await fail(3);
    jest.advanceTimersByTime(30_000);
    await expect(breaker.execute(badRequest)).rejects.toThrow(ClientError);
    expect(breaker.currentState).toBe('closed');
  });

  it('reopens for a full window when the trial call fails', async () => {
    await fail(3);
    jest.advanceTimersByTime(30_000);
    await expect(breaker.execute(down)).rejects.toThrow('503');
    expect(breaker.currentState).toBe('open');

    jest.advanceTimersByTime(29_999);
    await expect(breaker.execute(ok)).rejects.toThrow(CircuitOpenError);
    jest.advanceTimersByTime(1);
    await expect(breaker.execute(ok)).resolves.toBe('ok');
  });

  it('lets only one trial call through at a time', async () => {
    await fail(3);
    jest.advanceTimersByTime(30_000);
    let finishTrial!: (v: string) => void;
    const trial = breaker.execute(
      () => new Promise<string>((resolve) => (finishTrial = resolve)),
    );
    const fn = jest.fn(ok);

    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();

    finishTrial('ok');
    await expect(trial).resolves.toBe('ok');
    await expect(breaker.execute(fn)).resolves.toBe('ok');
  });

  it('does not extend the open window for calls that started while closed', async () => {
    let failLate!: (err: Error) => void;
    const late = breaker
      .execute(
        () => new Promise<string>((_resolve, reject) => (failLate = reject)),
      )
      .catch(() => undefined);
    await fail(3);
    jest.advanceTimersByTime(20_000);

    failLate(new Error('503'));
    await late;

    jest.advanceTimersByTime(10_000);
    await expect(breaker.execute(ok)).resolves.toBe('ok');
  });
});

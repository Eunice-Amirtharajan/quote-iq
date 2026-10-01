import { Request, Response } from 'express';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { getCorrelationId } from './correlation.store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware();

  const run = (headers: Record<string, string>) => {
    const res = { setHeader: jest.fn() };
    let idInsideRequest: string | undefined;
    middleware.use({ headers } as unknown as Request, res as unknown as Response, () => {
      idInsideRequest = getCorrelationId();
    });
    return { res, idInsideRequest };
  };

  it('reuses the caller’s x-correlation-id so one ID spans services', () => {
    const { res, idInsideRequest } = run({ 'x-correlation-id': 'upstream-id' });

    expect(idInsideRequest).toBe('upstream-id');
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'upstream-id');
  });

  it('generates a UUID when the caller sends none, and returns it in the response', () => {
    const { res, idInsideRequest } = run({});

    expect(idInsideRequest).toMatch(UUID);
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', idInsideRequest);
  });

  it('gives each request its own ID and does not leak it after the request', () => {
    const first = run({}).idInsideRequest;
    const second = run({}).idInsideRequest;

    expect(first).not.toBe(second);
    expect(getCorrelationId()).toBeUndefined();
  });
});

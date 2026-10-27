import { createServer, request, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { registerGracefulShutdown } from './graceful-shutdown';

const SIGNAL: NodeJS.Signals = 'SIGHUP';

describe('registerGracefulShutdown', () => {
  let server: Server;
  let port: number;
  let pending: ServerResponse[];
  const events: string[] = [];
  const logger = { info: jest.fn(), error: jest.fn() };
  const app = {
    getHttpServer: () => server,
    close: jest.fn(() => {
      events.push('app.close');
      return Promise.resolve();
    }),
  };

  // GET /slow is held open until the test answers it; anything else returns at once
  const get = (path: string) =>
    new Promise<number>((resolve, reject) => {
      request({ port, path, agent: false }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      })
        .on('error', reject)
        .end();
    });

  const waitFor = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(condition()).toBe(true);
  };

  const register = (
    overrides: { timeoutMs?: number; drainDelayMs?: number } = {},
  ) => {
    const exit = jest.fn((code: number) => events.push(`exit ${code}`));
    registerGracefulShutdown(app as unknown as INestApplication, {
      drainDelayMs: overrides.drainDelayMs ?? 20,
      timeoutMs: overrides.timeoutMs ?? 2_000,
      logger,
      onShutdownStart: () => events.push('not ready'),
      exit,
      signals: [SIGNAL],
    });
    return exit;
  };

  beforeEach(async () => {
    pending = [];
    events.length = 0;
    server = createServer((req, res) => {
      if (req.url === '/slow') pending.push(res);
      else res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    pending.forEach((res) => res.end());
    process.removeAllListeners(SIGNAL);
    await new Promise((r) => server.close(r));
    jest.clearAllMocks();
  });

  it('fails readiness, finishes in-flight requests, then closes the app and exits 0', async () => {
    const exit = register();
    const slow = get('/slow');
    await waitFor(() => pending.length === 1);

    process.emit(SIGNAL, SIGNAL);
    expect(events).toEqual(['not ready']);

    // After the drain delay the server stops accepting, but the running request is not cut off
    await waitFor(() => !server.listening);
    expect(app.close).not.toHaveBeenCalled();
    events.push('request done');
    pending[0].end('done');

    await expect(slow).resolves.toBe(200);
    await waitFor(() => exit.mock.calls.length > 0);
    expect(events).toEqual([
      'not ready',
      'request done',
      'app.close',
      'exit 0',
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      'SIGHUP received: failing readiness, draining for 20ms',
      'GracefulShutdown',
    );
  });

  it('keeps serving new requests during the drain delay', async () => {
    // A drain window wide enough that the request lands inside it even on a loaded CI runner
    const exit = register({ drainDelayMs: 500 });
    process.emit(SIGNAL, SIGNAL);
    await expect(get('/fast')).resolves.toBe(200);
    await waitFor(() => exit.mock.calls.length > 0);
  });

  it('exits 1 when in-flight requests outlast the timeout', async () => {
    const exit = register({ timeoutMs: 150 });
    void get('/slow').catch(() => undefined);
    await waitFor(() => pending.length === 1);

    process.emit(SIGNAL, SIGNAL);

    await waitFor(() => exit.mock.calls.length > 0);
    expect(exit).toHaveBeenCalledWith(1);
    expect(app.close).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Shutdown did not finish within 150ms (1 requests still in flight), exiting',
      undefined,
      'GracefulShutdown',
    );
  });

  it('exits 1 and logs when closing the app fails', async () => {
    app.close.mockRejectedValueOnce(new Error('amqp close failed'));
    const exit = register();

    process.emit(SIGNAL, SIGNAL);

    await waitFor(() => exit.mock.calls.length > 0);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Shutdown failed',
      expect.stringContaining('amqp close failed'),
      'GracefulShutdown',
    );
  });

  it('runs the shutdown once when a second signal arrives', async () => {
    const exit = jest.fn();
    registerGracefulShutdown(app as unknown as INestApplication, {
      drainDelayMs: 0,
      timeoutMs: 2_000,
      logger,
      onShutdownStart: jest.fn(),
      exit,
      signals: [SIGNAL, 'SIGBREAK'],
    });

    process.emit(SIGNAL, SIGNAL);
    process.emit('SIGBREAK', 'SIGBREAK');

    await waitFor(() => exit.mock.calls.length > 0);
    expect(app.close).toHaveBeenCalledTimes(1);
    process.removeAllListeners('SIGBREAK');
  });
});

// tracing.ts configures OpenTelemetry when it's first imported, so each test loads a fresh copy
// with the SDK mocked
const sdk = { start: jest.fn(), shutdown: jest.fn() };
jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn(() => sdk),
}));
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

type TracingModule = typeof import('./tracing');

const load = (otelEnabled: boolean): TracingModule => {
  process.env.OTEL_ENABLED = otelEnabled ? 'true' : 'false';
  let mod: TracingModule | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<TracingModule>('./tracing');
  });
  return mod!;
};

describe('tracing', () => {
  const saved = process.env.OTEL_ENABLED;

  afterEach(() => {
    process.env.OTEL_ENABLED = saved;
    jest.clearAllMocks();
  });

  it("starts the SDK when enabled, without a signal handler of its own (graceful shutdown's job)", () => {
    const before = process.listenerCount('SIGTERM');
    load(true);
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  it('flushes on shutdown', async () => {
    sdk.shutdown.mockResolvedValue(undefined);
    await load(true).shutdownTracing();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
  });

  it('does not fail the shutdown when the collector is unreachable', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    sdk.shutdown.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(load(true).shutdownTracing()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      'Tracing shutdown failed',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('does nothing when tracing is off', async () => {
    await load(false).shutdownTracing();
    expect(sdk.start).not.toHaveBeenCalled();
    expect(sdk.shutdown).not.toHaveBeenCalled();
  });
});

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const isTracingEnabled = process.env.OTEL_ENABLED === 'true';

let sdk: NodeSDK | undefined;

if (isTracingEnabled) {
  const headers: Record<string, string> = {};
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    // Format: "Authorization=Basic <base64>" — comma-separated key=value pairs
    for (const pair of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',')) {
      const idx = pair.indexOf('=');
      if (idx > 0)
        headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }

  const exporter = new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      'http://localhost:4318/v1/traces',
    headers,
  });

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'quoteiq-backend',
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filesystem instrumentation is very noisy — disable it
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/**
 * Flushes and stops tracing; a no-op when tracing is off. Called by the graceful shutdown as its
 * last step, so spans from the drain are exported too. This module registers no signal handler:
 * one here used to call process.exit() as soon as spans were flushed, cutting the drain short.
 * Best effort: an unreachable collector must not turn a clean shutdown into a failed one.
 */
export async function shutdownTracing(): Promise<void> {
  try {
    await sdk?.shutdown();
  } catch (err) {
    console.error('Tracing shutdown failed', err);
  }
}

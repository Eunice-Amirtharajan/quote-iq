import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const isTracingEnabled = process.env.OTEL_ENABLED === 'true';

if (isTracingEnabled) {
  const exporter = new OTLPTraceExporter({
    // Jaeger OTLP HTTP endpoint — default when running via docker compose
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  });

  const sdk = new NodeSDK({
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

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}

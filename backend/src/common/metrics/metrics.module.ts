import { Module, Global } from '@nestjs/common';
import {
  PrometheusModule,
  makeHistogramProvider,
  makeCounterProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeHistogramProvider({
      name: 'graphql_resolver_duration_seconds',
      help: 'GraphQL resolver execution time in seconds',
      labelNames: ['resolver', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    }),
    makeCounterProvider({
      name: 'groq_model_requests_total',
      help: 'Total Groq model invocations by model name and outcome',
      labelNames: ['model', 'outcome', 'tier'],
    }),
    makeCounterProvider({
      name: 'outbox_events_total',
      help: 'Outbox publish attempts by routing key and outcome (published, retry, failed)',
      labelNames: ['routing_key', 'outcome'],
    }),
    makeGaugeProvider({
      name: 'outbox_backlog_events',
      help: 'Outbox events not yet published (PENDING) or given up on (FAILED)',
      labelNames: ['status'],
    }),
    makeGaugeProvider({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state per downstream: 0 closed, 1 half-open, 2 open',
      labelNames: ['breaker'],
    }),
    makeCounterProvider({
      name: 'circuit_breaker_rejections_total',
      help: 'Calls failed fast without reaching the downstream because the circuit was open',
      labelNames: ['breaker'],
    }),
  ],
  exports: [
    'PROM_METRIC_GRAPHQL_RESOLVER_DURATION_SECONDS',
    'PROM_METRIC_GROQ_MODEL_REQUESTS_TOTAL',
    'PROM_METRIC_OUTBOX_EVENTS_TOTAL',
    'PROM_METRIC_OUTBOX_BACKLOG_EVENTS',
    'PROM_METRIC_CIRCUIT_BREAKER_STATE',
    'PROM_METRIC_CIRCUIT_BREAKER_REJECTIONS_TOTAL',
  ],
})
export class MetricsModule {}

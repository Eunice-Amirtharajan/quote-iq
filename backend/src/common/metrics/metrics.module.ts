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
    makeCounterProvider({
      name: 'ai_tokens_total',
      help: 'LLM and embedding tokens by provider, model, feature and kind (prompt, completion)',
      labelNames: ['provider', 'model', 'feature', 'kind'],
    }),
    makeCounterProvider({
      name: 'ai_completions_truncated_total',
      help: 'Completions cut off by their max_tokens cap, by model and feature',
      labelNames: ['model', 'feature'],
    }),
    makeGaugeProvider({
      name: 'ai_model_available',
      help: 'Whether each pinned Groq model is offered by Groq (1) or not (0), by role',
      labelNames: ['role', 'model'],
    }),
    makeCounterProvider({
      name: 'ai_quota_rejections_total',
      help: 'AI requests refused by the per-user limits, by reason (rate, budget)',
      labelNames: ['reason'],
    }),
    makeCounterProvider({
      name: 'ai_ungrounded_answers_total',
      help: 'RAG answers that cite no retrieved source (no_citation) or a source that was never retrieved (invented_citation), by feature',
      labelNames: ['feature', 'reason'],
    }),
  ],
  exports: [
    'PROM_METRIC_GRAPHQL_RESOLVER_DURATION_SECONDS',
    'PROM_METRIC_GROQ_MODEL_REQUESTS_TOTAL',
    'PROM_METRIC_OUTBOX_EVENTS_TOTAL',
    'PROM_METRIC_OUTBOX_BACKLOG_EVENTS',
    'PROM_METRIC_CIRCUIT_BREAKER_STATE',
    'PROM_METRIC_CIRCUIT_BREAKER_REJECTIONS_TOTAL',
    'PROM_METRIC_AI_TOKENS_TOTAL',
    'PROM_METRIC_AI_COMPLETIONS_TRUNCATED_TOTAL',
    'PROM_METRIC_AI_MODEL_AVAILABLE',
    'PROM_METRIC_AI_QUOTA_REJECTIONS_TOTAL',
    'PROM_METRIC_AI_UNGROUNDED_ANSWERS_TOTAL',
  ],
})
export class MetricsModule {}

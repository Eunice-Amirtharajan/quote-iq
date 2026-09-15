import { Module, Global } from '@nestjs/common';
import {
  PrometheusModule,
  makeHistogramProvider,
  makeCounterProvider,
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
  ],
  exports: [
    'PROM_METRIC_GRAPHQL_RESOLVER_DURATION_SECONDS',
    'PROM_METRIC_GROQ_MODEL_REQUESTS_TOTAL',
  ],
})
export class MetricsModule {}

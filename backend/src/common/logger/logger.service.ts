import { Injectable } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';
import { getCorrelationId } from '../correlation/correlation.store';

const isProduction = process.env.NODE_ENV === 'production';

// Injects the current correlation ID into the log info object before formatting.
const addCorrelationId = format((info) => {
  const cid = getCorrelationId();
  if (cid) info['cid'] = cid;
  return info;
});

const devFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  addCorrelationId(),
  format.printf(({ timestamp, level, message, context, cid, stack }) => {
    const ctx = context && typeof context === 'string' ? `[${context}]` : '';
    const cidStr = typeof cid === 'string' ? cid : '';
    const cidPart = cidStr ? ` cid:${cidStr}` : '';
    const trace = stack && typeof stack === 'string' ? `\n${stack}` : '';
    return `${String(timestamp)} ${level.toUpperCase()} ${ctx}${cidPart} ${String(message)}${trace}`;
  }),
);

// Production: one JSON object per line — machine-parseable by Datadog/CloudWatch/Loki.
// Fields: timestamp, level, context, cid, message, stack (on errors).
const prodFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  addCorrelationId(),
  format.json(),
);

@Injectable()
export class AppLogger {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: isProduction ? prodFormat : devFormat,
      transports: [new transports.Console()],
    });
  }

  info(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { context, stack: trace });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }
}

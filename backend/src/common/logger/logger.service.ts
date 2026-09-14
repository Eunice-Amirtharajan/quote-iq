import { Injectable } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';
import { getCorrelationId } from '../correlation/correlation.store';

@Injectable()
export class AppLogger {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.printf(({ timestamp, level, message, context, stack }) => {
          const ctx =
            context && typeof context === 'string' ? `[${context}]` : '';
          const cid = getCorrelationId();
          const cidPart = cid ? ` cid:${cid}` : '';
          const trace = stack && typeof stack === 'string' ? `\n${stack}` : '';
          return `${String(timestamp)} ${level.toUpperCase()} ${ctx}${cidPart} ${String(message)}${trace}`;
        }),
      ),
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

import { Injectable } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';

@Injectable()
export class AppLogger {
  private logger: Logger;

  constructor() {
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.printf(({ timestamp, level, message, context, stack }) => {
          const ctx =
            context && typeof context === 'string' ? `[${context}]` : '';
          const trace = stack && typeof stack === 'string' ? `\n${stack}` : '';
          return `${String(timestamp)} ${level.toUpperCase()} ${ctx} ${String(message)}${trace}`;
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

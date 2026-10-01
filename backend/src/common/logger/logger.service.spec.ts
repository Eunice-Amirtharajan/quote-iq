import { Test, TestingModule } from '@nestjs/testing';
import { Writable } from 'stream';
import { Logger, transports } from 'winston';
import { AppLogger } from './logger.service';
import { correlationStore } from '../correlation/correlation.store';

describe('AppLogger', () => {
  let logger: AppLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppLogger],
    }).compile();
    logger = module.get<AppLogger>(AppLogger);
  });

  it('logs info messages without throwing', () => {
    expect(() => logger.info('test message', 'TestContext')).not.toThrow();
  });

  it('logs warn messages without throwing', () => {
    expect(() => logger.warn('test warning', 'TestContext')).not.toThrow();
  });

  it('logs error messages without throwing', () => {
    expect(() =>
      logger.error('test error', 'stack trace', 'TestContext'),
    ).not.toThrow();
  });

  it('logs debug messages without throwing', () => {
    expect(() => logger.debug('test debug', 'TestContext')).not.toThrow();
  });

  it('handles missing context parameter', () => {
    expect(() => logger.info('message without context')).not.toThrow();
  });

  it('handles missing trace in error', () => {
    expect(() => logger.error('error without trace')).not.toThrow();
  });

  describe('correlation ID', () => {
    // Capture formatted output by adding a stream transport to the underlying winston logger
    const capture = () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _enc, done) {
          lines.push(chunk.toString());
          done();
        },
      });
      (logger as unknown as { logger: Logger }).logger.add(new transports.Stream({ stream }));
      return lines;
    };

    it('adds the current correlation ID to every log line', () => {
      const lines = capture();
      correlationStore.run('cid-123', () => {
        logger.info('inside a request', 'Test');
        logger.error('failed inside a request', undefined, 'Test');
      });

      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line).toContain('cid-123');
    });

    it('omits the correlation ID outside a request or when it is empty', () => {
      const lines = capture();
      logger.info('startup message', 'Test');
      correlationStore.run('', () => logger.info('message with no upstream ID', 'Test'));

      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line).not.toContain('cid');
    });
  });
});

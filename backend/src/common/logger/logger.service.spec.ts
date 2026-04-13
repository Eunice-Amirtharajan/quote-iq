import { Test, TestingModule } from '@nestjs/testing';
import { AppLogger } from './logger.service';

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
});

import { ServiceUnavailableException } from '@nestjs/common';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  name: string;
  /** Consecutive failures that open the circuit */
  failureThreshold: number;
  /** How long the circuit stays open before one trial call is let through */
  openMs: number;
  /**
   * Which errors count against the downstream. Others (e.g. a 400 for a bad prompt) are
   * rethrown untouched and count as a healthy response, since the downstream did answer.
   */
  isFailure: (err: unknown) => boolean;
  onStateChange?: (state: CircuitState) => void;
  onReject?: () => void;
}

/** Thrown instead of calling the downstream while the circuit is open. */
export class CircuitOpenError extends ServiceUnavailableException {
  constructor(
    name: string,
    readonly retryAfterMs: number,
  ) {
    super(
      `${name} is temporarily unavailable, try again in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
  }
}

/**
 * Consecutive-failure circuit breaker. Closed: calls go through and failures are counted.
 * Open: calls fail at once with CircuitOpenError. After openMs it goes half-open and lets a
 * single trial call through -- success closes the circuit, failure opens it for another openMs.
 * One logical call (e.g. a whole model fallback chain) should be one execute().
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;

  constructor(private readonly options: CircuitBreakerOptions) {}

  get currentState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const waitMs = this.openedAt + this.options.openMs - Date.now();
      if (waitMs > 0) throw this.reject(waitMs);
      this.transition('half_open');
    }
    const isTrial = this.state === 'half_open';
    if (isTrial) {
      // Only one probe at a time; everyone else keeps failing fast until it settles
      if (this.trialInFlight) throw this.reject(this.options.openMs);
      this.trialInFlight = true;
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (this.options.isFailure(err)) this.recordFailure(isTrial);
      else this.recordSuccess();
      throw err;
    } finally {
      if (isTrial) this.trialInFlight = false;
    }
  }

  private recordSuccess(): void {
    this.failures = 0;
    if (this.state !== 'closed') this.transition('closed');
  }

  private recordFailure(isTrial: boolean): void {
    if (isTrial) {
      this.open();
      return;
    }
    // A call that started before the circuit opened must not extend the open window
    if (this.state !== 'closed') return;
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) this.open();
  }

  private open(): void {
    this.openedAt = Date.now();
    this.failures = 0;
    this.transition('open');
  }

  private reject(waitMs: number): CircuitOpenError {
    this.options.onReject?.();
    return new CircuitOpenError(this.options.name, waitMs);
  }

  private transition(state: CircuitState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }
}

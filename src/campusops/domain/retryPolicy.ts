/**
 * When CampusOps repeats a request (week 09).
 *
 * - Only failures that may be transient are retried: a timeout, 408, 429, 500,
 *   502, 503 and 504. A 4xx answer is a decision of the server and is reported.
 * - A POST is repeated only with a stable idempotency key (at least 8
 *   characters), so the server can recognise the repetition. Without one the
 *   answer is `requiresStableIdempotencyKey: true` and no retry.
 * - There is no retry from the attempt `maxAttempts` on (4 by default).
 * - A valid Retry-After is honoured exactly. One longer than
 *   `maxRetryAfterMs` is not waited for: the caller falls back or reports.
 * - Otherwise the wait doubles from `baseDelayMs` up to `maxDelayMs`.
 *
 * Every limit is configurable, and every wait is finite: the worst case is
 * `worstCaseWaitMs(limits)`. A disconnection is not retried here: it is not a
 * server answer, and the queue or the manual alternative takes over.
 */

export type RetryStatus = number | 'timeout';

export type RetryInput = Readonly<{
  method: 'GET' | 'POST';
  status: RetryStatus;
  /** The attempt that just failed, starting at 1. */
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>;

export type RetryDecision = Readonly<{ retry: boolean; delayMs: number; requiresStableIdempotencyKey: boolean }>;

export type RetryLimits = Readonly<{
  /** Total attempts, the first included. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetryAfterMs: number;
}>;

export const DEFAULT_RETRY_LIMITS: RetryLimits = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 2000,
  maxRetryAfterMs: 5000,
};

export const MIN_IDEMPOTENCY_KEY_LENGTH = 8;

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

const NO_RETRY: RetryDecision = { retry: false, delayMs: 0, requiresStableIdempotencyKey: false };

export function isRetryable(status: RetryStatus): boolean {
  return status === 'timeout' || RETRYABLE_STATUSES.has(status);
}

export function hasStableIdempotencyKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.trim().length >= MIN_IDEMPOTENCY_KEY_LENGTH;
}

/** Progressive wait for the retry after `attempt`: base, 2 x base, 4 x base... capped. */
export function backoffDelayMs(attempt: number, limits: RetryLimits = DEFAULT_RETRY_LIMITS): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 30);
  return Math.min(limits.maxDelayMs, limits.baseDelayMs * 2 ** exponent);
}

/** The longest a caller can wait across all retries of one operation. */
export function worstCaseWaitMs(limits: RetryLimits = DEFAULT_RETRY_LIMITS): number {
  return Math.max(limits.maxAttempts - 1, 0) * Math.max(limits.maxDelayMs, limits.maxRetryAfterMs);
}

export function planRetry(input: RetryInput, limits: RetryLimits = DEFAULT_RETRY_LIMITS): RetryDecision {
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || !isRetryable(input.status)) {
    return NO_RETRY;
  }
  if (input.method === 'POST' && !hasStableIdempotencyKey(input.idempotencyKey)) {
    return { retry: false, delayMs: 0, requiresStableIdempotencyKey: true };
  }
  if (input.attempt >= limits.maxAttempts) {
    return NO_RETRY;
  }
  const retryAfter = input.retryAfterMs;
  if (retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter >= 0) {
    if (retryAfter > limits.maxRetryAfterMs) {
      return NO_RETRY;
    }
    return { retry: true, delayMs: Math.round(retryAfter), requiresStableIdempotencyKey: false };
  }
  return { retry: true, delayMs: backoffDelayMs(input.attempt, limits), requiresStableIdempotencyKey: false };
}

export type SleepFn = (ms: number) => Promise<void>;

export const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries for an HTTP client. Absent, the client sends each request once. */
export type RetryOptions = Readonly<{ limits?: RetryLimits; sleep?: SleepFn }>;

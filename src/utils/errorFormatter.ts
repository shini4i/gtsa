import { GitlabApiError } from '../gitlab/errors';

let debugLoggingEnabled = false;

/**
 * Enables or disables verbose error output (stack traces).
 *
 * @param enabled - When true, include stack traces in formatted errors.
 */
export function setDebugLogging(enabled: boolean): void {
  debugLoggingEnabled = enabled;
}

/**
 * Indicates whether debug logging is currently enabled.
 *
 * @returns `true` when stack traces should be emitted.
 */
export function isDebugLoggingEnabled(): boolean {
  return debugLoggingEnabled;
}

/**
 * Converts unknown error values into human-readable strings aligned with CLI output expectations.
 *
 * @param error - The thrown value to format.
 * @returns Stable error message suitable for console logging.
 */
export function formatError(error: unknown): string {
  if (debugLoggingEnabled && error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (error instanceof GitlabApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

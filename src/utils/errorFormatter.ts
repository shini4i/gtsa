import { GitlabApiError } from '../gitlab/errors';

let debugLoggingEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugLoggingEnabled = enabled;
}

export function isDebugLoggingEnabled(): boolean {
  return debugLoggingEnabled;
}

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

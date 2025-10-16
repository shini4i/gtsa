import { AxiosError, Method, isAxiosError } from 'axios';

export interface GitlabApiErrorOptions {
  method: Method;
  endpoint: string;
  statusCode?: number;
  retryable: boolean;
  responseBody?: unknown;
  originalError?: unknown;
}

export class GitlabApiError extends Error {
  readonly statusCode?: number;
  readonly method: Method;
  readonly endpoint: string;
  readonly retryable: boolean;
  readonly responseBody?: unknown;

  constructor(message: string, options: GitlabApiErrorOptions) {
    super(message);
    this.name = 'GitlabApiError';
    this.method = options.method;
    this.endpoint = options.endpoint;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable;
    this.responseBody = options.responseBody;

    if (options.originalError !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.originalError,
        enumerable: false,
        writable: false,
        configurable: true,
      });
    }
  }

  static fromUnknown(error: unknown, method: Method, endpoint: string): GitlabApiError {
    if (isAxiosError(error)) {
      return GitlabApiError.fromAxiosError(error, method, endpoint);
    }

    return new GitlabApiError(
      GitlabApiError.buildMessage(method, endpoint, undefined, 'Unexpected error'),
      {
        method,
        endpoint,
        retryable: false,
        originalError: error,
      },
    );
  }

  private static fromAxiosError(error: AxiosError, method: Method, endpoint: string): GitlabApiError {
    const statusCode = error.response?.status;
    const retryable = GitlabApiError.isRetryable(error, statusCode);
    const details = GitlabApiError.extractDetails(error);

    return new GitlabApiError(
      GitlabApiError.buildMessage(method, endpoint, statusCode, details),
      {
        method,
        endpoint,
        statusCode,
        retryable,
        originalError: error,
        responseBody: error.response?.data,
      },
    );
  }

  private static buildMessage(method: Method, endpoint: string, statusCode?: number, details?: string): string {
    const statusPart = statusCode ? ` (status ${statusCode})` : '';
    const detailsPart = details ? `: ${details}` : '';
    return `GitLab API request failed [${method.toUpperCase()} ${endpoint}]${statusPart}${detailsPart}`;
  }

  private static isRetryable(error: AxiosError, statusCode?: number): boolean {
    if (statusCode && (statusCode === 429 || statusCode >= 500)) {
      return true;
    }

    // Network or timeout errors typically surface with these codes in Axios
    const retryableCodes = ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    return false;
  }

  private static extractDetails(error: AxiosError): string | undefined {
    if (typeof error.response?.data === 'string') {
      return error.response.data;
    }

    if (error.response?.data && typeof error.response.data === 'object') {
      const data = error.response.data as Record<string, unknown>;
      if (typeof data.message === 'string') {
        return data.message;
      }
      if (typeof data.error === 'string') {
        return data.error;
      }
    }

    return error.message;
  }
}

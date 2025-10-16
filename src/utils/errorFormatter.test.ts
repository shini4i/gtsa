import { GitlabApiError } from '../gitlab/errors';
import { formatError, setDebugLogging } from './errorFormatter';

describe('formatError', () => {
  afterEach(() => {
    setDebugLogging(false);
  });

  it('returns the error message by default', () => {
    const error = new Error('boom');
    expect(formatError(error)).toBe('boom');
  });

  it('returns GitLab API error message when not in debug mode', () => {
    const apiError = new GitlabApiError('failure', {
      method: 'get',
      endpoint: 'projects/1',
      retryable: false,
      statusCode: 404,
    });
    expect(formatError(apiError)).toBe(apiError.message);
  });

  it('returns the stack trace when debug logging is enabled', () => {
    const error = new Error('with stack');
    setDebugLogging(true);
    const formatted = formatError(error);
    expect(formatted).toContain('Error: with stack');
    expect(formatted).toContain('at ');
  });

  it('returns string input as-is', () => {
    expect(formatError('plain error')).toBe('plain error');
  });
});

import { AxiosError } from 'axios';
import { GitlabApiError } from './errors';

describe('GitlabApiError', () => {
  const endpoint = '/projects/1';
  const createConfig = () => ({ method: 'get', url: endpoint, headers: {} }) as any;

  it('wraps Axios errors with response details and marks retryable when status indicates retry', () => {
    const config = createConfig();
    const response = {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      config,
      data: { message: 'Temporary outage' },
    };
    const axiosError = new AxiosError('Service Unavailable', 'ERR_BAD_RESPONSE', config, undefined, response);

    const error = GitlabApiError.fromUnknown(axiosError, 'get', endpoint);

    expect(error).toBeInstanceOf(GitlabApiError);
    expect(error.retryable).toBe(true);
    expect(error.statusCode).toBe(503);
    expect(error.responseBody).toEqual(response.data);
    expect(error.message).toContain('Temporary outage');
  });

  it('propagates Axios errors without responses and flags retryable codes', () => {
    const config = createConfig();
    const axiosError = new AxiosError('Connection reset by peer', 'ECONNRESET', config);
    axiosError.code = 'ECONNRESET';

    const error = GitlabApiError.fromUnknown(axiosError, 'get', endpoint);

    expect(error.retryable).toBe(true);
    expect(error.message).toContain('Connection reset by peer');
  });

  it('falls back to generic error wrapping for non-Axios errors', () => {
    const original = new Error('boom');

    const error = GitlabApiError.fromUnknown(original, 'post', endpoint);

    expect(error.retryable).toBe(false);
    expect(error.cause).toBe(original);
    expect(error.message).toContain('Unexpected error');
  });

  it('extracts details from string responses and error fields', () => {
    const config = createConfig();
    const stringResponse = {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config,
      data: 'gateway timeout',
    };
    const errorResponse = {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config,
      data: { error: 'Bad Request' },
    };

    const stringError = new AxiosError('Server error', 'ERR_BAD_RESPONSE', config, undefined, stringResponse);
    const errorError = new AxiosError('Server error', 'ERR_BAD_RESPONSE', config, undefined, errorResponse);

    expect(GitlabApiError.fromUnknown(stringError, 'get', endpoint).message).toContain('gateway timeout');
    expect(GitlabApiError.fromUnknown(errorError, 'get', endpoint).message).toContain('Bad Request');
  });
});

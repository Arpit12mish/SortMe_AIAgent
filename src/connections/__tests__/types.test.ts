import { ApiError } from '../types';

describe('ApiError', () => {
  it('surfaces the backend message when present', () => {
    const err = new ApiError(502, { error: 'provider_error', message: 'GitHub rate limited', retryable: true, requiresReconnect: false });
    expect(err.message).toBe('GitHub rate limited');
    expect(err.retryable).toBe(true);
    expect(err.requiresReconnect).toBe(false);
  });

  it('treats a 401 as requiring reconnect even if the body does not say so', () => {
    const err = new ApiError(401, { error: 'InvalidSessionException', message: 'Invalid or expired session token' });
    expect(err.requiresReconnect).toBe(true);
  });

  it('defaults retryable/requiresReconnect to false when the body omits them', () => {
    const err = new ApiError(500, { error: 'internal_error', message: 'Something went wrong' });
    expect(err.retryable).toBe(false);
    expect(err.requiresReconnect).toBe(false);
  });

  it('falls back to a generic message when the response body could not be parsed', () => {
    const err = new ApiError(503, null);
    expect(err.message).toBe('Request failed with status 503');
    expect(err.retryable).toBe(false);
  });
});

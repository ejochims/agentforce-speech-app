import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SalesforceTokenManager, fetchWithTimeout } from '../salesforce-oauth';

const tokenResponse = (token = 'tok-1') => ({
  ok: true,
  json: async () => ({ access_token: token, instance_url: 'https://test.my.salesforce.com' }),
});

const makeManager = () =>
  new SalesforceTokenManager({
    domainUrl: 'https://test.my.salesforce.com',
    clientId: 'key',
    clientSecret: 'secret',
    label: 'Test',
  });

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SalesforceTokenManager', () => {
  it('fetches a token and returns it with the instance URL', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(tokenResponse() as any);

    const token = await makeManager().getToken();
    expect(token.accessToken).toBe('tok-1');
    expect(token.instanceUrl).toBe('https://test.my.salesforce.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://test.my.salesforce.com/services/oauth2/token');
  });

  it('caches the token across calls', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(tokenResponse() as any);
    const manager = makeManager();

    await manager.getToken();
    await manager.getToken();
    await manager.getToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent refreshes into a single OAuth request', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }) as any);
    const manager = makeManager();

    const [a, b, c] = [manager.getToken(), manager.getToken(), manager.getToken()];
    resolveFetch(tokenResponse());

    const results = await Promise.all([a, b, c]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.accessToken === 'tok-1')).toBe(true);
  });

  it('refreshes after the 25-minute TTL expires', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tokenResponse('tok-1') as any)
      .mockResolvedValueOnce(tokenResponse('tok-2') as any);
    const manager = makeManager();

    expect((await manager.getToken()).accessToken).toBe('tok-1');

    vi.advanceTimersByTime(24 * 60 * 1000);
    expect((await manager.getToken()).accessToken).toBe('tok-1');

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect((await manager.getToken()).accessToken).toBe('tok-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a labelled error on auth failure and retries on the next call', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'bad creds' } as any)
      .mockResolvedValueOnce(tokenResponse('tok-after-failure') as any);
    const manager = makeManager();

    await expect(manager.getToken()).rejects.toThrow('Test authentication failed: 401 bad creds');

    // The failed refresh must not be cached — a retry should issue a new request
    expect((await manager.getToken()).accessToken).toBe('tok-after-failure');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchWithTimeout', () => {
  it('aborts when the timeout elapses before headers arrive', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject((opts.signal as AbortSignal).reason));
        }) as any
    );

    await expect(fetchWithTimeout('https://example.com', {}, 20)).rejects.toThrow(
      'Request timed out after 20ms'
    );
  });

  it('resolves normally when the response arrives in time', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const res = await fetchWithTimeout('https://example.com', {}, 1000);
    expect(res.ok).toBe(true);
  });
});

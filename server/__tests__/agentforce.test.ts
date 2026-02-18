import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Agentforce API response in messages-array format */
function makeMessagesResponse(text: string, extra: Record<string, any> = {}) {
  return {
    messages: [{ message: text, type: 'Text' }],
    status: 'SUCCESS',
    ...extra,
  };
}

/** Build a minimal Agentforce API response in single-message format */
function makeSingleMessageResponse(text: string) {
  return { message: text, status: 'SUCCESS' };
}

// ─── AgentforceClient unit tests ──────────────────────────────────────────────
// We import the class after mocking global fetch so we can control every
// outbound HTTP call without hitting real Salesforce APIs.

describe('AgentforceClient', () => {
  const ENV = {
    SALESFORCE_DOMAIN_URL: 'https://test.salesforce.com',
    SALESFORCE_CONSUMER_KEY: 'test-key',
    SALESFORCE_CONSUMER_SECRET: 'test-secret',
    SALESFORCE_AGENT_ID: 'agent-abc',
  };

  beforeEach(() => {
    // Inject required env vars before each test
    Object.assign(process.env, ENV);
    vi.stubGlobal('fetch', vi.fn());
    // Reset modules so the singleton at the bottom of agentforce.ts is
    // re-evaluated fresh each test (avoids constructor throwing at import time)
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up env vars
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  // Helper: mock a successful OAuth token response
  function mockTokenResponse() {
    return {
      ok: true,
      json: async () => ({
        access_token: 'mock-token-xyz',
        instance_url: 'https://test.my.salesforce.com',
        id: 'id',
        token_type: 'Bearer',
        issued_at: Date.now().toString(),
        signature: 'sig',
      }),
    };
  }

  // Helper: mock a successful session creation response
  function mockSessionResponse(sessionId = 'session-001') {
    return {
      ok: true,
      json: async () => ({ sessionId, externalSessionKey: 'ext-key' }),
    };
  }

  // Helper: mock a successful message response (messages-array format)
  function mockMessageResponse(text: string) {
    return {
      ok: true,
      json: async () => makeMessagesResponse(text),
    };
  }

  // Helper: mock a successful DELETE (204 No Content)
  function mockDeleteResponse() {
    return { ok: true, status: 204 };
  }

  // ─── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws when required env vars are missing', async () => {
      // Delete an env var BEFORE importing so the singleton at module level
      // also fails, proving the constructor guard works end-to-end.
      delete process.env.SALESFORCE_DOMAIN_URL;
      await expect(import('../agentforce')).rejects.toThrow(
        'Missing required Salesforce environment variables'
      );
    });

    it('constructs successfully when all env vars are present', async () => {
      const { AgentforceClient } = await import('../agentforce');
      expect(() => new AgentforceClient()).not.toThrow();
    });
  });

  // ─── sendMessage – response parsing ─────────────────────────────────────────

  describe('sendMessage – response format handling', () => {
    it('extracts text from messages array format', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)    // OAuth
        .mockResolvedValueOnce(mockSessionResponse() as any)  // startSession
        .mockResolvedValueOnce({                              // sendMessage
          ok: true,
          json: async () => makeMessagesResponse('Hello from agent'),
        } as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any);  // endSession

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgent('Hi');
      expect(result).toBe('Hello from agent');
    });

    it('extracts text from single message format (fallback)', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => makeSingleMessageResponse('Single message response'),
        } as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgent('Hi');
      expect(result).toBe('Single message response');
    });

    it('returns fallback string when response has no message content', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'SUCCESS' }), // no message field
        } as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgent('Hi');
      expect(result).toBe('Response received from agent');
    });

    it('picks the last message when messages array has multiple entries', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            messages: [
              { message: 'First message', type: 'Text' },
              { message: 'Second message', type: 'Text' },
              { message: 'Final answer', type: 'Text' },
            ],
            status: 'SUCCESS',
          }),
        } as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgent('Hi');
      expect(result).toBe('Final answer');
    });
  });

  // ─── Token caching ──────────────────────────────────────────────────────────

  describe('OAuth token caching', () => {
    it('reuses a cached token for subsequent API calls', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)    // OAuth – only called once
        .mockResolvedValueOnce(mockSessionResponse('s1') as any)
        .mockResolvedValueOnce(mockMessageResponse('Response 1') as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse('s2') as any)
        .mockResolvedValueOnce(mockMessageResponse('Response 2') as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();

      await client.chatWithAgent('First message');
      await client.chatWithAgent('Second message');

      // OAuth endpoint should only be called once (token is cached)
      const oauthCalls = fetchMock.mock.calls.filter(([url]) =>
        (url as string).includes('/oauth2/token')
      );
      expect(oauthCalls).toHaveLength(1);
    });
  });

  // ─── chatWithAgentInConversation – session persistence ──────────────────────

  describe('chatWithAgentInConversation', () => {
    it('creates a new session when no existingSessionId is provided', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse('brand-new-session') as any)
        .mockResolvedValueOnce(mockMessageResponse('Hello!') as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgentInConversation('Hi');

      expect(result.sessionId).toBe('brand-new-session');
      expect(result.metadata.isNewSession).toBe(true);
      expect(result.metadata.sessionCreationMs).toBeTypeOf('number');
    });

    it('reuses an existing session when existingSessionId is provided', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockMessageResponse('Response') as any); // no session creation call

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgentInConversation('Hi', 'existing-session-123');

      expect(result.sessionId).toBe('existing-session-123');
      expect(result.metadata.isNewSession).toBe(false);
      expect(result.metadata.sessionCreationMs).toBeUndefined();

      // Verify no session-creation call was made
      const sessionCreationCalls = fetchMock.mock.calls.filter(([url]) =>
        (url as string).includes('/sessions') && fetchMock.mock.calls.indexOf([url] as any) === 0
      );
      // The sessions endpoint should only be called for the message, not to create a session
      const allCalls = fetchMock.mock.calls.map(([url]) => url as string);
      const sessionCalls = allCalls.filter(url => url.includes('/agents/'));
      expect(sessionCalls).toHaveLength(0); // no new session creation
    });

    it('returns metadata with timing information', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce(mockMessageResponse('Test response') as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgentInConversation('Hello');

      expect(result.metadata.agentProcessingMs).toBeTypeOf('number');
      expect(result.metadata.agentProcessingMs).toBeGreaterThanOrEqual(0);
    });

    it('returns metadata with message count from messages array', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            messages: [
              { message: 'Part 1', type: 'Text' },
              { message: 'Part 2', type: 'Text' },
            ],
            status: 'SUCCESS',
          }),
        } as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgentInConversation('Hi');

      expect(result.metadata.messageCount).toBe(2);
      expect(result.metadata.messageTypes).toEqual(['Text', 'Text']);
    });

    it('returns metadata with rawResponse containing full API data', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            messages: [{ message: 'Hi', type: 'Text' }],
            status: 'SUCCESS',
            someExtraField: 'extra-data',
          }),
        } as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgentInConversation('Hello');

      expect(result.metadata.rawResponse).toMatchObject({
        status: 'SUCCESS',
        someExtraField: 'extra-data',
      });
    });

    it('returns fallback response and error metadata on API failure', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        } as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgentInConversation('Hi');

      expect(result.response).toContain('connectivity issues');
      expect(result.metadata.status).toBe('error');
      expect(result.metadata.agentProcessingMs).toBe(0);
      expect(result.metadata.rawResponse).toHaveProperty('error');
    });

    it('does NOT end the session after a conversation turn (keeps it alive)', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse() as any)
        .mockResolvedValueOnce(mockMessageResponse('Response') as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      await client.chatWithAgentInConversation('Hi');

      // DELETE should NOT have been called (session stays alive)
      const deleteCalls = fetchMock.mock.calls.filter(([, options]) =>
        (options as RequestInit)?.method === 'DELETE'
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('chatWithAgent returns a helpful fallback on API error', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        } as any);

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      const result = await client.chatWithAgent('Test');

      expect(result).toContain('connectivity issues');
      expect(result).toContain('Test'); // echoes the original message
    });

    it('chatWithAgent still tries to end the session even after an error', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(mockTokenResponse() as any)
        .mockResolvedValueOnce(mockSessionResponse('cleanup-session') as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Error',
        } as any)
        .mockResolvedValueOnce(mockDeleteResponse() as any); // endSession cleanup

      const { AgentforceClient } = await import('../agentforce');
      const client = new AgentforceClient();
      await client.chatWithAgent('Test');

      const deleteCalls = fetchMock.mock.calls.filter(([, options]) =>
        (options as RequestInit)?.method === 'DELETE'
      );
      expect(deleteCalls).toHaveLength(1);
    });
  });
});

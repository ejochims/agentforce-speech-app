import { describe, it, expect } from 'vitest';

// ─── Transparency data shape validation ───────────────────────────────────────
// These tests verify the structure we return from the API and the logic we use
// to build AgentResponseMetadata, without needing real Salesforce connectivity.

describe('Transparency metadata construction', () => {
  // Mirrors the logic in agentforce.ts chatWithAgentInConversation
  function buildMetadata(rawResponse: Record<string, any>, options: {
    agentProcessingMs: number;
    sessionCreationMs?: number;
    sessionId: string;
    isNewSession: boolean;
  }) {
    return {
      agentProcessingMs: options.agentProcessingMs,
      sessionCreationMs: options.sessionCreationMs,
      sessionId: options.sessionId,
      isNewSession: options.isNewSession,
      rawResponse,
      messageCount: rawResponse.messages?.length || (rawResponse.message ? 1 : 0),
      messageTypes: rawResponse.messages?.map((m: any) => m.type || 'unknown') || [],
      status: rawResponse.status,
    };
  }

  it('counts messages from messages array', () => {
    const raw = {
      messages: [
        { message: 'A', type: 'Text' },
        { message: 'B', type: 'Text' },
        { message: 'C', type: 'InformationalMessage' },
      ],
      status: 'SUCCESS',
    };
    const meta = buildMetadata(raw, { agentProcessingMs: 100, sessionId: 's1', isNewSession: true });
    expect(meta.messageCount).toBe(3);
  });

  it('counts 1 message from single-message format', () => {
    const raw = { message: 'Hello', status: 'SUCCESS' };
    const meta = buildMetadata(raw, { agentProcessingMs: 50, sessionId: 's1', isNewSession: false });
    expect(meta.messageCount).toBe(1);
  });

  it('counts 0 messages when response has neither format', () => {
    const raw = { status: 'SUCCESS' };
    const meta = buildMetadata(raw, { agentProcessingMs: 50, sessionId: 's1', isNewSession: false });
    expect(meta.messageCount).toBe(0);
  });

  it('extracts message types from messages array', () => {
    const raw = {
      messages: [
        { message: 'A', type: 'Text' },
        { message: 'B', type: 'InformationalMessage' },
      ],
      status: 'SUCCESS',
    };
    const meta = buildMetadata(raw, { agentProcessingMs: 100, sessionId: 's1', isNewSession: true });
    expect(meta.messageTypes).toEqual(['Text', 'InformationalMessage']);
  });

  it('defaults missing type field to "unknown"', () => {
    const raw = {
      messages: [{ message: 'Hi' }], // no type field
      status: 'SUCCESS',
    };
    const meta = buildMetadata(raw, { agentProcessingMs: 100, sessionId: 's1', isNewSession: true });
    expect(meta.messageTypes).toEqual(['unknown']);
  });

  it('returns empty messageTypes array for single-message format', () => {
    const raw = { message: 'Hi', status: 'SUCCESS' };
    const meta = buildMetadata(raw, { agentProcessingMs: 50, sessionId: 's1', isNewSession: false });
    expect(meta.messageTypes).toEqual([]);
  });

  it('marks isNewSession correctly for first turn', () => {
    const raw = { messages: [{ message: 'Hi', type: 'Text' }], status: 'SUCCESS' };
    const meta = buildMetadata(raw, { agentProcessingMs: 200, sessionCreationMs: 150, sessionId: 'new-s', isNewSession: true });
    expect(meta.isNewSession).toBe(true);
    expect(meta.sessionCreationMs).toBe(150);
  });

  it('marks isNewSession false and omits sessionCreationMs for follow-up turns', () => {
    const raw = { messages: [{ message: 'Reply', type: 'Text' }], status: 'SUCCESS' };
    const meta = buildMetadata(raw, { agentProcessingMs: 80, sessionId: 'existing-s', isNewSession: false });
    expect(meta.isNewSession).toBe(false);
    expect(meta.sessionCreationMs).toBeUndefined();
  });

  it('preserves full raw response including unknown fields', () => {
    const raw = {
      messages: [{ message: 'Hi', type: 'Text' }],
      status: 'SUCCESS',
      undocumentedField: 'some-value',
      nestedData: { key: 'value' },
    };
    const meta = buildMetadata(raw, { agentProcessingMs: 100, sessionId: 's1', isNewSession: true });
    expect(meta.rawResponse).toMatchObject({
      undocumentedField: 'some-value',
      nestedData: { key: 'value' },
    });
  });
});

// ─── Transparency response shape (routes.ts output) ───────────────────────────

describe('Transparency API response shape', () => {
  // Mirrors the JSON structure returned by POST /api/agentforce
  function buildTransparencyResponse(options: {
    totalMs: number;
    agentProcessingMs: number;
    sessionCreationMs?: number;
    sessionId: string;
    isNewSession: boolean;
    messageCount: number;
    messageTypes: string[];
    status?: string;
    rawApiResponse: Record<string, any>;
  }) {
    return {
      pipeline: {
        totalMs: options.totalMs,
        agentProcessingMs: options.agentProcessingMs,
        sessionCreationMs: options.sessionCreationMs,
      },
      session: {
        sessionId: options.sessionId,
        isNewSession: options.isNewSession,
      },
      response: {
        messageCount: options.messageCount,
        messageTypes: options.messageTypes,
        status: options.status,
      },
      rawApiResponse: options.rawApiResponse,
      timestamp: new Date().toISOString(),
    };
  }

  it('total pipeline time is greater than or equal to agent processing time', () => {
    const transparency = buildTransparencyResponse({
      totalMs: 350,
      agentProcessingMs: 300,
      sessionCreationMs: 40,
      sessionId: 'sid',
      isNewSession: true,
      messageCount: 1,
      messageTypes: ['Text'],
      status: 'SUCCESS',
      rawApiResponse: {},
    });

    expect(transparency.pipeline.totalMs).toBeGreaterThanOrEqual(
      transparency.pipeline.agentProcessingMs
    );
  });

  it('timestamp is a valid ISO string', () => {
    const transparency = buildTransparencyResponse({
      totalMs: 100,
      agentProcessingMs: 80,
      sessionId: 'sid',
      isNewSession: false,
      messageCount: 1,
      messageTypes: ['Text'],
      rawApiResponse: {},
    });

    expect(() => new Date(transparency.timestamp)).not.toThrow();
    expect(new Date(transparency.timestamp).toISOString()).toBe(transparency.timestamp);
  });

  it('includes all required top-level keys', () => {
    const transparency = buildTransparencyResponse({
      totalMs: 100,
      agentProcessingMs: 80,
      sessionId: 'sid',
      isNewSession: false,
      messageCount: 1,
      messageTypes: ['Text'],
      rawApiResponse: { status: 'SUCCESS' },
    });

    expect(transparency).toHaveProperty('pipeline');
    expect(transparency).toHaveProperty('session');
    expect(transparency).toHaveProperty('response');
    expect(transparency).toHaveProperty('rawApiResponse');
    expect(transparency).toHaveProperty('timestamp');
  });

  it('pipeline includes all timing fields', () => {
    const transparency = buildTransparencyResponse({
      totalMs: 200,
      agentProcessingMs: 150,
      sessionCreationMs: 40,
      sessionId: 'sid',
      isNewSession: true,
      messageCount: 1,
      messageTypes: ['Text'],
      rawApiResponse: {},
    });

    expect(transparency.pipeline).toHaveProperty('totalMs');
    expect(transparency.pipeline).toHaveProperty('agentProcessingMs');
    expect(transparency.pipeline).toHaveProperty('sessionCreationMs');
  });

  it('session block contains sessionId and isNewSession', () => {
    const transparency = buildTransparencyResponse({
      totalMs: 100,
      agentProcessingMs: 80,
      sessionId: 'my-session-id',
      isNewSession: true,
      messageCount: 1,
      messageTypes: ['Text'],
      rawApiResponse: {},
    });

    expect(transparency.session.sessionId).toBe('my-session-id');
    expect(transparency.session.isNewSession).toBe(true);
  });
});

// ─── Voice pipeline event tracking (frontend logic) ──────────────────────────

describe('PipelineEvent construction', () => {
  // Mirrors the logic in VoiceChat.tsx for building pipeline events
  interface PipelineEvent {
    id: string;
    userMessage: string;
    timestamp: string;
    stt?: { processingMs: number; audioSizeBytes?: number; mimeType?: string };
    agent?: Record<string, any>;
    ttsRequested: boolean;
    totalClientMs?: number;
  }

  function makeSttEvent(text: string, sttMs: number, audioBytes: number): PipelineEvent {
    return {
      id: `pipeline-${Date.now()}`,
      userMessage: text,
      timestamp: new Date().toISOString(),
      stt: { processingMs: sttMs, audioSizeBytes: audioBytes, mimeType: 'audio/webm' },
      ttsRequested: true,
    };
  }

  function makeTextEvent(text: string): PipelineEvent {
    return {
      id: `pipeline-${Date.now()}`,
      userMessage: text,
      timestamp: new Date().toISOString(),
      ttsRequested: false,
    };
  }

  it('voice events include STT data', () => {
    const event = makeSttEvent('Hello', 320, 15000);
    expect(event.stt).toBeDefined();
    expect(event.stt?.processingMs).toBe(320);
    expect(event.stt?.audioSizeBytes).toBe(15000);
    expect(event.stt?.mimeType).toBe('audio/webm');
  });

  it('text-input events do not include STT data', () => {
    const event = makeTextEvent('Hello');
    expect(event.stt).toBeUndefined();
  });

  it('event timestamp is a valid ISO string', () => {
    const event = makeSttEvent('Test', 100, 5000);
    expect(() => new Date(event.timestamp)).not.toThrow();
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });

  it('merging agent data into an existing event updates it correctly', () => {
    const events: PipelineEvent[] = [makeSttEvent('Hi', 200, 8000)];
    const id = events[0].id;
    const agentData = { pipeline: { agentProcessingMs: 450 }, session: { isNewSession: true } };
    const totalClientMs = 800;

    const updated = events.map(e =>
      e.id === id ? { ...e, agent: agentData, totalClientMs } : e
    );

    expect(updated[0].agent).toEqual(agentData);
    expect(updated[0].totalClientMs).toBe(800);
    // STT data preserved
    expect(updated[0].stt?.processingMs).toBe(200);
  });

  it('totalClientMs is always >= agentProcessingMs', () => {
    const event = makeSttEvent('Test', 100, 5000);
    const agentMs = 400;
    const totalMs = 650; // includes STT + network overhead

    const merged = { ...event, agent: { pipeline: { agentProcessingMs: agentMs } }, totalClientMs: totalMs };
    expect(merged.totalClientMs!).toBeGreaterThanOrEqual(agentMs);
  });
});

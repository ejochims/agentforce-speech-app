import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerRoutes } from '../routes';

// Integration tests against the real route handlers with MemStorage
// (DATABASE_URL is unset in tests) and unconfigured Salesforce clients.

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server?.close();
});

const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init);
const postJson = (path: string, body: unknown, method = 'POST') =>
  api(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function createConversation(title = 'Test conversation') {
  const res = await postJson('/api/conversations', { title, status: 'active' });
  expect(res.status).toBe(200);
  return res.json();
}

describe('conversation endpoints', () => {
  it('creates and lists conversations', async () => {
    const conv = await createConversation('List me');
    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe('List me');

    const list = await (await api('/api/conversations')).json();
    expect(list.some((c: any) => c.id === conv.id)).toBe(true);
  });

  it('rejects invalid conversation payloads', async () => {
    const res = await postJson('/api/conversations', { nope: true });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid conversation data');
  });

  it('fetches a single conversation and 404s on unknown ids', async () => {
    const conv = await createConversation('Find me');
    const found = await api(`/api/conversations/${conv.id}`);
    expect(found.status).toBe(200);

    const missing = await api('/api/conversations/no-such-id');
    expect(missing.status).toBe(404);
  });

  it('updates a conversation title', async () => {
    const conv = await createConversation('Old title');
    const res = await postJson(`/api/conversations/${conv.id}`, { title: '  New title  ' }, 'PATCH');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('New title');
  });

  it('rejects empty or missing titles on PATCH', async () => {
    const conv = await createConversation();
    expect((await postJson(`/api/conversations/${conv.id}`, { title: '   ' }, 'PATCH')).status).toBe(400);
    expect((await postJson(`/api/conversations/${conv.id}`, {}, 'PATCH')).status).toBe(400);
  });

  it('404s when patching an unknown conversation', async () => {
    const res = await postJson('/api/conversations/no-such-id', { title: 'X' }, 'PATCH');
    expect(res.status).toBe(404);
  });
});

describe('turn endpoints', () => {
  it('creates and lists turns within a conversation', async () => {
    const conv = await createConversation('With turns');

    const created = await postJson(`/api/conversations/${conv.id}/turns`, {
      role: 'user',
      text: 'Hello agent',
    });
    expect(created.status).toBe(200);
    const turn = await created.json();
    expect(turn.conversationId).toBe(conv.id);

    const turns = await (await api(`/api/conversations/${conv.id}/turns`)).json();
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe('Hello agent');
  });

  it('404s when creating a turn for an unknown conversation', async () => {
    const res = await postJson('/api/conversations/no-such-id/turns', {
      role: 'user',
      text: 'Hi',
    });
    expect(res.status).toBe(404);
  });

  it('rejects turns with missing fields', async () => {
    const conv = await createConversation();
    const res = await postJson(`/api/conversations/${conv.id}/turns`, { role: 'user' });
    expect(res.status).toBe(400);
  });
});

describe('agentforce endpoints', () => {
  it('rejects requests without text', async () => {
    const conv = await createConversation();
    const res = await postJson('/api/agentforce', { conversationId: conv.id });
    expect(res.status).toBe(400);
  });

  it('rejects requests without conversationId', async () => {
    const res = await postJson('/api/agentforce', { text: 'Hello' });
    expect(res.status).toBe(400);
  });

  it('rejects text exceeding the length cap', async () => {
    const conv = await createConversation();
    const res = await postJson('/api/agentforce', {
      text: 'x'.repeat(4001),
      conversationId: conv.id,
    });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown conversation', async () => {
    const res = await postJson('/api/agentforce', {
      text: 'Hello',
      conversationId: 'no-such-id',
    });
    expect(res.status).toBe(404);
  });

  it('returns the fallback response when Salesforce is not configured', async () => {
    const conv = await createConversation();
    const res = await postJson('/api/agentforce', {
      text: 'Hello',
      conversationId: conv.id,
    });
    // AgentforceClient never throws — it returns an explanatory fallback
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain('Hello');
    expect(body.transparency.response.status).toBe('error');
  });

  it('stream endpoint validates input before opening the stream', async () => {
    const res = await postJson('/api/agentforce/stream', { text: '' });
    expect(res.status).toBe(400);
  });

  it('stream endpoint emits an SSE error event when the session cannot start', async () => {
    const conv = await createConversation();
    const res = await postJson('/api/agentforce/stream', {
      text: 'Hello',
      conversationId: conv.id,
    });
    // SSE headers are flushed before the session starts, so the failure
    // arrives as an `error` event on a 200 stream rather than a JSON 500
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('event: error');
    expect(body).toContain('Missing required Salesforce environment variables');
  });
});

describe('tts endpoint', () => {
  it('rejects missing text on GET', async () => {
    const res = await api('/api/tts');
    expect(res.status).toBe(400);
  });

  it('rejects text exceeding the length cap on GET', async () => {
    const res = await api(`/api/tts?text=${'x'.repeat(4001)}`);
    expect(res.status).toBe(400);
  });

  it('rejects missing text on POST', async () => {
    const res = await postJson('/api/tts', { voice: 'allison' });
    expect(res.status).toBe(400);
  });
});

describe('settings endpoints', () => {
  it('returns default settings', async () => {
    const res = await api('/api/settings');
    expect(res.status).toBe(200);
    const settings = await res.json();
    expect(settings.id).toBe('default');
    expect(settings.voice).toBe('allison');
  });

  it('updates settings and rejects invalid payloads', async () => {
    const ok = await postJson('/api/settings', { voice: 'nova' }, 'PUT');
    expect(ok.status).toBe(200);
    expect((await ok.json()).voice).toBe('nova');

    const bad = await postJson('/api/settings', { voice: 42 }, 'PUT');
    expect(bad.status).toBe(400);
  });
});

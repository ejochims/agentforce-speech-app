// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgentStream } from '../src/hooks/useAgentStream';

// The blocking-fallback mutation goes through apiRequest — mock it so we can
// assert the fallback path without a server.
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn().mockResolvedValue({ text: 'fallback response', conversationId: 'conv-1' }),
}));
import { apiRequest } from '@/lib/queryClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a Response-like object streaming the given SSE events. */
function sseResponse(events: Array<{ event: string; data: object }>) {
  const encoder = new TextEncoder();
  const payload = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
  } as Response;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setup(overrides: Partial<Parameters<typeof useAgentStream>[0]> = {}) {
  const config = {
    audioEnabled: true,
    playTextAsAudio: vi.fn().mockResolvedValue(true),
    onSaveTurn: vi.fn(),
    onTransparencyUpdate: vi.fn(),
    currentPipelineRef: { current: null } as React.MutableRefObject<any>,
    onConversationExpired: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => useAgentStream(config), { wrapper });
  return { config, hook };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAgentStream', () => {
  it('accumulates chunks and saves the full text on done', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { event: 'chunk', data: { text: 'Hello ' } },
        { event: 'chunk', data: { text: 'world' } },
        { event: 'done', data: { text: 'Hello world' } },
      ])
    );
    const { config, hook } = setup({ audioEnabled: false });

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    expect(config.onSaveTurn).toHaveBeenCalledWith('conv-1', 'Hello world');
    expect(hook.result.current.isAgentStreaming).toBe(false);
    expect(hook.result.current.streamingText).toBeNull();
  });

  it('starts early TTS on the first sentence and speaks only the remainder on done', async () => {
    const fullText = 'First sentence is done. Second sentence follows here.';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { event: 'chunk', data: { text: 'First sentence is done. Second ' } },
        { event: 'chunk', data: { text: 'sentence follows here.' } },
        { event: 'done', data: { text: fullText } },
      ])
    );
    const { config, hook } = setup();

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    expect(config.playTextAsAudio).toHaveBeenCalledTimes(2);
    expect(config.playTextAsAudio).toHaveBeenNthCalledWith(1, 'First sentence is done.');
    expect(config.playTextAsAudio).toHaveBeenNthCalledWith(2, 'Second sentence follows here.');
    // Early TTS + remainder must cover the full text exactly once
    const spoken = config.playTextAsAudio.mock.calls.map((c) => c[0]).join(' ');
    expect(spoken).toBe(fullText);
  });

  it('does not split early TTS at abbreviations like Dr.', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { event: 'chunk', data: { text: 'Dr. Smith is available now. Want me to book it?' } },
        { event: 'done', data: { text: 'Dr. Smith is available now. Want me to book it?' } },
      ])
    );
    const { config, hook } = setup();

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    expect(config.playTextAsAudio).toHaveBeenNthCalledWith(1, 'Dr. Smith is available now.');
  });

  it('speaks the whole response at done when no sentence completed during streaming', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { event: 'chunk', data: { text: 'Short answer' } },
        { event: 'done', data: { text: 'Short answer' } },
      ])
    );
    const { config, hook } = setup();

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    expect(config.playTextAsAudio).toHaveBeenCalledTimes(1);
    expect(config.playTextAsAudio).toHaveBeenCalledWith('Short answer');
  });

  it('reports transparency data with the active pipeline', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { event: 'chunk', data: { text: 'Hi' } },
        { event: 'done', data: { text: 'Hi', transparency: { pipeline: { totalMs: 5 } } } },
      ])
    );
    const pipelineRef = { current: { id: 'p1', startTime: Date.now(), userMessage: 'hi' } };
    const { config, hook } = setup({ audioEnabled: false, currentPipelineRef: pipelineRef });

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    expect(config.onTransparencyUpdate).toHaveBeenCalledWith(
      'p1',
      { pipeline: { totalMs: 5 } },
      expect.any(Number),
      false
    );
  });

  it('falls back to the blocking endpoint when the stream endpoint is unavailable', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, body: null } as Response);
    const { config, hook } = setup({ audioEnabled: false });

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/agentforce', {
        method: 'POST',
        body: { text: 'hi', conversationId: 'conv-1' },
      });
    });
    // Fallback success path saves the turn
    await waitFor(() => {
      expect(config.onSaveTurn).toHaveBeenCalledWith('conv-1', 'fallback response');
    });
  });

  it('falls back to the blocking endpoint on an SSE error event', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([{ event: 'error', data: { error: 'boom' } }])
    );
    const { hook } = setup({ audioEnabled: false });

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/agentforce', expect.anything());
    });
  });

  it('saves accumulated text when the stream ends without a done event', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([{ event: 'chunk', data: { text: 'Partial response' } }])
    );
    const { config, hook } = setup({ audioEnabled: false });

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    expect(config.onSaveTurn).toHaveBeenCalledWith('conv-1', 'Partial response');
  });

  it('falls back to the blocking endpoint when fetch itself rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('network down'));
    const { hook } = setup({ audioEnabled: false });

    await act(() => hook.result.current.streamAgentResponse('hi', 'conv-1'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/agentforce', expect.anything());
    });
  });
});

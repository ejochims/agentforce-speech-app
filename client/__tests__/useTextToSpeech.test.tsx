// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTextToSpeech } from '../src/hooks/useTextToSpeech';

// ─── Mock Web Audio API ───────────────────────────────────────────────────────

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  /** Behaviour knobs set per-test before rendering the hook. */
  static initialState: AudioContextState = 'running';
  static resumeUnsticks = true;

  state: AudioContextState = MockAudioContext.initialState;
  destination = {};
  sources: any[] = [];

  resume = vi.fn(async () => {
    if (MockAudioContext.resumeUnsticks) this.state = 'running';
  });
  close = vi.fn(() => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({} as AudioBuffer));
  createBufferSource = vi.fn(() => {
    const source: any = { buffer: null, connect: vi.fn(), onended: null };
    source.start = vi.fn();
    // Real AudioBufferSourceNodes fire onended after stop()
    source.stop = vi.fn(() => source.onended?.());
    this.sources.push(source);
    return source;
  });

  constructor() {
    MockAudioContext.instances.push(this);
  }
}

// ─── Mock HTMLAudioElement ────────────────────────────────────────────────────

class MockAudio {
  static instances: MockAudio[] = [];

  src = '';
  muted = false;
  volume = 1;
  currentTime = 0;
  duration = NaN;
  ended = false;
  preload = '';
  paused = true;

  private listeners = new Map<string, Set<() => void>>();

  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatch('pause');
  });

  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }

  constructor() {
    MockAudio.instances.push(this);
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  MockAudioContext.instances = [];
  MockAudioContext.initialState = 'running';
  MockAudioContext.resumeUnsticks = true;
  MockAudio.instances = [];
  (window as any).AudioContext = MockAudioContext;
  (globalThis as any).Audio = MockAudio;
  // Returning user with audio enabled — the hook restores an AudioContext at mount
  localStorage.setItem('audioEnabled', 'true');
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete (window as any).AudioContext;
  delete (globalThis as any).Audio;
});

const renderTts = () => renderHook(() => useTextToSpeech());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTextToSpeech', () => {
  it('stores text as pending when audio is disabled', async () => {
    localStorage.setItem('audioEnabled', 'false');
    const { result } = renderTts();

    let played: boolean | undefined;
    await act(async () => { played = await result.current.playTextAsAudio('hello'); });

    expect(played).toBe(false);
    expect(result.current.pendingAudioText).toBe('hello');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('plays sequential TTS requests one at a time, in order', async () => {
    const { result } = renderTts();
    const ctx = MockAudioContext.instances[0];

    let p1!: Promise<boolean>, p2!: Promise<boolean>;
    await act(async () => {
      p1 = result.current.playTextAsAudio('first');
      p2 = result.current.playTextAsAudio('second');
    });

    // First clip starts; second must stay queued until the first ends
    await waitFor(() => expect(ctx.sources).toHaveLength(1));
    expect(ctx.sources[0].start).toHaveBeenCalled();
    expect(result.current.isAudioPlaying).toBe(true);

    await act(async () => { ctx.sources[0].onended(); });
    expect(await p1).toBe(true);

    await waitFor(() => expect(ctx.sources).toHaveLength(2));
    expect(ctx.sources[1].start).toHaveBeenCalled();

    await act(async () => { ctx.sources[1].onended(); });
    expect(await p2).toBe(true);

    // Each clip fetched exactly once
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('stopAudio cancels queued TTS so it never plays', async () => {
    const { result } = renderTts();
    const ctx = MockAudioContext.instances[0];

    let p1!: Promise<boolean>, p2!: Promise<boolean>;
    await act(async () => {
      p1 = result.current.playTextAsAudio('playing');
      p2 = result.current.playTextAsAudio('queued');
    });
    await waitFor(() => expect(ctx.sources).toHaveLength(1));

    await act(async () => { result.current.stopAudio(); });

    // The active source is stopped, and the queued clip bails out without playing
    expect(ctx.sources[0].stop).toHaveBeenCalled();
    await expect(p1).resolves.toBe(true); // settled via onended fired by stop()
    await expect(p2).resolves.toBe(false);
    expect(ctx.sources).toHaveLength(1);
    expect(result.current.isAudioPlaying).toBe(false);
  });

  it('falls back to HTMLAudioElement when the AudioContext stays suspended', async () => {
    MockAudioContext.initialState = 'suspended';
    MockAudioContext.resumeUnsticks = false; // iOS behaviour outside a user gesture
    const { result } = renderTts();

    await act(async () => { result.current.playTextAsAudio('hello'); });

    await waitFor(() => expect(MockAudio.instances.length).toBeGreaterThan(0));
    const audio = MockAudio.instances[MockAudio.instances.length - 1];
    await waitFor(() => expect(audio.play).toHaveBeenCalled());
    expect(audio.src).toContain('/api/tts?text=hello');
  });

  it('settles the playback promise when stopAudio cancels HTMLAudioElement playback', async () => {
    // Regression test: stopAudio() used to leave the playback promise hanging
    // and the Safari poll interval running forever.
    MockAudioContext.initialState = 'suspended';
    MockAudioContext.resumeUnsticks = false;
    const { result } = renderTts();

    let playback!: Promise<boolean>;
    await act(async () => { playback = result.current.playTextAsAudio('hello'); });

    const audio = MockAudio.instances[MockAudio.instances.length - 1];
    await waitFor(() => expect(audio.play).toHaveBeenCalled());

    await act(async () => { result.current.stopAudio(); });

    // pause() dispatches 'pause'; with the generation bumped the handler must
    // settle the promise instead of waiting for an 'ended' that never comes
    await expect(playback).resolves.toBe(false);
    expect(audio.pause).toHaveBeenCalled();
    expect(result.current.isAudioPlaying).toBe(false);
  });

  it('disableAudio closes the context and clears pending state', async () => {
    const { result } = renderTts();
    const ctx = MockAudioContext.instances[0];

    await act(async () => { result.current.disableAudio(); });

    expect(ctx.close).toHaveBeenCalled();
    expect(result.current.audioEnabled).toBe(false);
    expect(localStorage.getItem('audioEnabled')).toBe('false');

    // Subsequent plays park the text as pending instead of fetching
    let played: boolean | undefined;
    await act(async () => { played = await result.current.playTextAsAudio('later'); });
    expect(played).toBe(false);
    expect(result.current.pendingAudioText).toBe('later');
  });
});

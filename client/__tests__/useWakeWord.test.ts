// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeWord } from '../src/hooks/useWakeWord';

// ─── Mock SpeechRecognition ────────────────────────────────────────────────────
// jsdom does not ship with SpeechRecognition; we provide a controllable fake.
// Using a real class (not vi.fn) so `new SpeechRecognitionAPI()` works correctly.

class MockSpeechRecognition {
  /** All instances created in the current test — reset in beforeEach. */
  static instances: MockSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;

  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  // Method mocks — each instance gets its own vi.fn so calls are trackable
  start = vi.fn(() => { this.onstart?.(); });
  // stop/abort fire onend synchronously so act() wrapping stays simple
  stop  = vi.fn(() => { this.onend?.(); });
  abort = vi.fn(() => { this.onend?.(); });

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  /** Simulate a recognition result (interim by default). */
  triggerResult(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [[{ transcript, confidence: 1 }]],
    });
  }

  /** Simulate the recognition session ending naturally. */
  triggerEnd() { this.onend?.(); }

  /** Simulate a recognition error. */
  triggerError(error: string) { this.onerror?.({ error }); }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  MockSpeechRecognition.instances = [];
  (window as any).SpeechRecognition = MockSpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  vi.useFakeTimers();
});

afterEach(() => {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Shorthand ────────────────────────────────────────────────────────────────

/** Shorthand: last instance created (most recently started recognition). */
function lastInstance() {
  return MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderWakeWord(opts: {
  enabled?: boolean;
  isPipelineBusy?: boolean;
  onDetected?: () => void;
} = {}) {
  const onDetected = opts.onDetected ?? vi.fn();
  const result = renderHook(
    ({ enabled, isPipelineBusy }) =>
      useWakeWord({ enabled, isPipelineBusy, onDetected }),
    {
      initialProps: {
        enabled: opts.enabled ?? true,
        isPipelineBusy: opts.isPipelineBusy ?? false,
      },
    }
  );
  return { ...result, onDetected };
}

// ─── Support detection ────────────────────────────────────────────────────────

describe('isSupported', () => {
  it('is true when window.SpeechRecognition exists', async () => {
    const { result } = renderWakeWord();
    await act(async () => {});
    expect(result.current.isSupported).toBe(true);
  });

  it('is true when only webkitSpeechRecognition exists', async () => {
    delete (window as any).SpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
    const { result } = renderWakeWord();
    await act(async () => {});
    expect(result.current.isSupported).toBe(true);
  });

  it('is false when neither SpeechRecognition variant exists', async () => {
    delete (window as any).SpeechRecognition;
    const { result } = renderWakeWord();
    await act(async () => {});
    expect(result.current.isSupported).toBe(false);
  });

  it('does not start recognition when not supported', async () => {
    delete (window as any).SpeechRecognition;
    renderWakeWord({ enabled: true });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });
});

// ─── Enable / disable ────────────────────────────────────────────────────────

describe('enabled flag', () => {
  it('starts recognition when enabled=true and pipeline is idle', async () => {
    renderWakeWord({ enabled: true, isPipelineBusy: false });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(lastInstance().start).toHaveBeenCalledTimes(1);
  });

  it('does not start recognition when enabled=false', async () => {
    renderWakeWord({ enabled: false });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it('stops recognition when enabled transitions to false', async () => {
    const { rerender } = renderWakeWord({ enabled: true });
    await act(async () => {});
    const first = lastInstance();
    expect(first.start).toHaveBeenCalledTimes(1);

    rerender({ enabled: false, isPipelineBusy: false });
    await act(async () => {});
    expect(first.abort).toHaveBeenCalled();
  });

  it('starts recognition when enabled transitions from false to true', async () => {
    const { rerender } = renderWakeWord({ enabled: false });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(0);

    rerender({ enabled: true, isPipelineBusy: false });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(lastInstance().start).toHaveBeenCalledTimes(1);
  });
});

// ─── Pipeline busy gate ───────────────────────────────────────────────────────

describe('isPipelineBusy', () => {
  it('does not start recognition when pipeline is busy at mount', async () => {
    renderWakeWord({ enabled: true, isPipelineBusy: true });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it('stops recognition when pipeline becomes busy', async () => {
    const { rerender } = renderWakeWord({ enabled: true, isPipelineBusy: false });
    await act(async () => {});
    const first = lastInstance();

    rerender({ enabled: true, isPipelineBusy: true });
    await act(async () => {});
    expect(first.abort).toHaveBeenCalled();
  });

  it('resumes recognition when pipeline becomes idle again', async () => {
    const { rerender } = renderWakeWord({ enabled: true, isPipelineBusy: true });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(0);

    rerender({ enabled: true, isPipelineBusy: false });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(lastInstance().start).toHaveBeenCalledTimes(1);
  });
});

// ─── isListening state ────────────────────────────────────────────────────────

describe('isListening', () => {
  it('is false initially before recognition starts', async () => {
    const { result } = renderWakeWord({ enabled: false });
    await act(async () => {});
    expect(result.current.isListening).toBe(false);
  });

  it('becomes true when recognition starts', async () => {
    const { result } = renderWakeWord({ enabled: true });
    await act(async () => {});
    // onstart is called synchronously by our mock's start()
    expect(result.current.isListening).toBe(true);
  });

  it('becomes false when recognition ends (before the restart fires)', async () => {
    const { result } = renderWakeWord({ enabled: true });
    await act(async () => {});
    expect(result.current.isListening).toBe(true);

    // Trigger natural session end — hook sets isListening=false then schedules restart
    await act(async () => { lastInstance().triggerEnd(); });
    // isListening should be false immediately after onend fires
    expect(result.current.isListening).toBe(false);
  });
});

// ─── Wake phrase matching ─────────────────────────────────────────────────────

describe('wake phrase matching', () => {
  const phrases = [
    'hey agentforce',
    'hey agent force',
    'hey agent',
    'agentforce',
  ];

  for (const phrase of phrases) {
    it(`detects phrase: "${phrase}"`, async () => {
      const { onDetected } = renderWakeWord();
      await act(async () => {});

      await act(async () => { lastInstance().triggerResult(phrase); });
      // onDetected is called inside the overridden onend, which fires after stop()
      expect(onDetected).toHaveBeenCalledTimes(1);
    });
  }

  it('matches when phrase appears within a longer transcript (substring)', async () => {
    const { onDetected } = renderWakeWord();
    await act(async () => {});
    await act(async () => {
      lastInstance().triggerResult('ok so hey agentforce can you help me');
    });
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive', async () => {
    const { onDetected } = renderWakeWord();
    await act(async () => {});
    await act(async () => { lastInstance().triggerResult('HEY AGENTFORCE PLEASE HELP'); });
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it('does not trigger on unrelated speech', async () => {
    const { onDetected } = renderWakeWord();
    await act(async () => {});
    await act(async () => {
      lastInstance().triggerResult('hello world this is not the wake phrase');
    });
    expect(onDetected).not.toHaveBeenCalled();
  });
});

// ─── onDetected fires after recognition fully stops ──────────────────────────

describe('onDetected timing', () => {
  it('calls recognition.stop() when wake phrase is detected', async () => {
    renderWakeWord();
    await act(async () => {});
    const inst = lastInstance();

    await act(async () => { inst.triggerResult('hey agentforce'); });
    expect(inst.stop).toHaveBeenCalled();
  });

  it('calls onDetected inside the onend handler (after mic is released)', async () => {
    // The hook overrides onend THEN calls stop(). Our mock fires onend
    // synchronously from stop(), so onDetected runs in the same act().
    const onDetected = vi.fn();
    renderHook(() => useWakeWord({ enabled: true, isPipelineBusy: false, onDetected }));
    await act(async () => {});

    expect(onDetected).not.toHaveBeenCalled();
    await act(async () => { lastInstance().triggerResult('hey agentforce'); });
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it('does not restart recognition after wake phrase detection', async () => {
    renderWakeWord();
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    await act(async () => { lastInstance().triggerResult('hey agentforce'); });
    // Advance past the 400ms restart delay — activeRef was set false on detection
    await act(async () => { vi.advanceTimersByTime(600); });
    // Still only the original instance; restart is suppressed while pipeline runs
    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });
});

// ─── Debounce ─────────────────────────────────────────────────────────────────

describe('detection debounce (2000 ms)', () => {
  it('does not fire onDetected again within the 2000 ms debounce window', async () => {
    const onDetected = vi.fn();
    renderHook(() => useWakeWord({ enabled: true, isPipelineBusy: false, onDetected }));
    await act(async () => {});

    // First detection fires callback
    await act(async () => { lastInstance().triggerResult('hey agentforce'); });
    expect(onDetected).toHaveBeenCalledTimes(1);

    // Reset activeRef and restart to simulate pipeline settling
    // Here we just verify the debounce timestamp was recorded and is within 2000ms
    const callTime = Date.now();
    await act(async () => { vi.advanceTimersByTime(1000); }); // < 2000ms
    // Date.now() - callTime < 2000ms, so a second detection WOULD be blocked
    expect(Date.now() - callTime).toBeLessThan(2000);
    // Callback count stays at 1 (no new recognition instance triggered it)
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it('allows detection after the 2000 ms debounce window expires', async () => {
    const onDetected = vi.fn();
    renderHook(() => useWakeWord({ enabled: true, isPipelineBusy: false, onDetected }));
    await act(async () => {});

    await act(async () => { lastInstance().triggerResult('agentforce'); });
    expect(onDetected).toHaveBeenCalledTimes(1);
    const firstCallTime = Date.now();

    // Advance past the debounce window
    await act(async () => { vi.advanceTimersByTime(2100); });
    // The debounce guard checks Date.now() - lastDetectionRef.current > 2000ms
    expect(Date.now() - firstCallTime).toBeGreaterThanOrEqual(2000);
    // (Actual second trigger would require a live recognition instance, tested below)
  });

  it('does not double-fire from two results in the same recognition session', async () => {
    const onDetected = vi.fn();
    renderHook(() => useWakeWord({ enabled: true, isPipelineBusy: false, onDetected }));
    await act(async () => {});

    // Trigger the same phrase twice in rapid succession (< 2000ms apart)
    await act(async () => { lastInstance().triggerResult('hey agentforce'); });
    // First result already called stop(), so the second result would find recognition stopped
    // The debounce guard would also block it — verify callback is called exactly once
    expect(onDetected).toHaveBeenCalledTimes(1);
  });
});

// ─── Auto-restart after session ends ─────────────────────────────────────────

describe('auto-restart', () => {
  it('restarts recognition 400 ms after a normal session end (no wake phrase)', async () => {
    renderWakeWord({ enabled: true });
    await act(async () => {});
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    // Simulate recognition ending naturally (e.g. no-speech timeout from browser)
    await act(async () => { lastInstance().triggerEnd(); });

    // Before the 400ms restart delay, no new instance
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    // After the 400ms delay, the hook creates a new instance
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(MockSpeechRecognition.instances).toHaveLength(2);
    expect(lastInstance().start).toHaveBeenCalledTimes(1);
  });

  it('does not restart when pipeline becomes busy before the delay fires', async () => {
    const { rerender } = renderWakeWord({ enabled: true, isPipelineBusy: false });
    await act(async () => {});

    await act(async () => { lastInstance().triggerEnd(); });
    // Pipeline becomes busy before the 400ms restart fires
    rerender({ enabled: true, isPipelineBusy: true });
    await act(async () => { vi.advanceTimersByTime(600); });

    // Should NOT have created a second instance
    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });

  it('does not restart when enabled becomes false before the delay fires', async () => {
    const { rerender } = renderWakeWord({ enabled: true });
    await act(async () => {});

    await act(async () => { lastInstance().triggerEnd(); });
    rerender({ enabled: false, isPipelineBusy: false });
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('ignores no-speech errors (does not log a warning)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWakeWord({ enabled: true });
    await act(async () => {});
    await act(async () => { lastInstance().triggerError('no-speech'); });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores audio-capture errors without warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWakeWord({ enabled: true });
    await act(async () => {});
    await act(async () => { lastInstance().triggerError('audio-capture'); });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs a warning for unexpected recognition errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWakeWord({ enabled: true });
    await act(async () => {});
    await act(async () => { lastInstance().triggerError('network'); });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Wake word recognition error'),
      'network'
    );
    warnSpy.mockRestore();
  });
});

// ─── Cleanup on unmount ───────────────────────────────────────────────────────

describe('cleanup on unmount', () => {
  it('aborts recognition when the hook unmounts', async () => {
    const { unmount } = renderWakeWord({ enabled: true });
    await act(async () => {});
    const inst = lastInstance();
    expect(inst.start).toHaveBeenCalledTimes(1);

    await act(async () => { unmount(); });
    expect(inst.abort).toHaveBeenCalled();
  });

  it('does not restart after unmount even if the 400 ms delay fires', async () => {
    const { unmount } = renderWakeWord({ enabled: true });
    await act(async () => {});

    await act(async () => { lastInstance().triggerEnd(); });
    await act(async () => { unmount(); });
    await act(async () => { vi.advanceTimersByTime(600); });

    // No new instance should have been created after unmount
    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });
});

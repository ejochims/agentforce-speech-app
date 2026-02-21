// @vitest-environment jsdom
/**
 * Tests for the wake-word silence detection feature in VoiceRecordButton.
 *
 * When startRecording({ silenceTimeoutMs }) is called (wake-word path), the
 * component monitors the audio stream and auto-stops after the specified
 * period of continuous silence.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import VoiceRecordButton, { type VoiceRecordButtonHandle } from '../src/components/VoiceRecordButton';

// ─── MockAnalyser ─────────────────────────────────────────────────────────────

class MockAnalyser {
  fftSize = 256;
  frequencyBinCount = 128;
  smoothingTimeConstant = 0;
  private _data = new Uint8Array(128).fill(128); // 128 = silence (zero-crossing)

  getByteTimeDomainData(out: Uint8Array) { out.set(this._data.slice(0, out.length)); }
  getByteFrequencyData(out: Uint8Array)  { out.fill(0); }

  simulateSpeech()  { this._data.fill(200); }  // high amplitude = loud
  simulateSilence() { this._data.fill(128); }  // 128 = centre = silence
}

// ─── MockAudioContext ─────────────────────────────────────────────────────────

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  analyser = new MockAnalyser();
  _closed = false;
  _source = { connect: vi.fn(), disconnect: vi.fn() };

  constructor() { MockAudioContext.instances.push(this); }

  createAnalyser()           { return this.analyser as unknown as AnalyserNode; }
  createMediaStreamSource()  { return this._source as unknown as MediaStreamAudioSourceNode; }
  close()                    { this._closed = true; return Promise.resolve(); }
}

// ─── MockMediaRecorder ────────────────────────────────────────────────────────

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => false);

  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn((_timeslice?: number) => { this.state = 'recording'; });
  stop  = vi.fn(() => { this.state = 'inactive'; this.onstop?.(); });

  constructor() { MockMediaRecorder.instances.push(this); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function latestRecorder() {
  return MockMediaRecorder.instances[MockMediaRecorder.instances.length - 1];
}
function latestAudioCtx() {
  return MockAudioContext.instances[MockAudioContext.instances.length - 1];
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let mockStream: MediaStream;
let onRecordingStop: ReturnType<typeof vi.fn>;
let onRecordingStart: ReturnType<typeof vi.fn>;
let onError: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockAudioContext.instances   = [];
  MockMediaRecorder.instances  = [];
  MockMediaRecorder.isTypeSupported.mockReturnValue(false);

  mockStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;

  // Stub browser APIs using real classes (avoids vi.fn-as-constructor issues)
  (window as any).AudioContext = MockAudioContext;
  (window as any).MediaRecorder = MockMediaRecorder;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(() => Promise.resolve(mockStream)) },
    configurable: true,
    writable: true,
  });

  onRecordingStop  = vi.fn();
  onRecordingStart = vi.fn();
  onError          = vi.fn();

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as any).AudioContext;
  delete (window as any).MediaRecorder;
});

// ─── Render helper ────────────────────────────────────────────────────────────

function renderButton() {
  const ref = React.createRef<VoiceRecordButtonHandle>();
  const ui = render(
    <VoiceRecordButton
      ref={ref}
      onRecordingStart={onRecordingStart}
      onRecordingStop={onRecordingStop}
      onError={onError}
      state="idle"
      showStatusText={false}
    />
  );
  return { ref, ...ui };
}

async function startWithSilenceTimeout(
  ref: React.RefObject<VoiceRecordButtonHandle>,
  silenceTimeoutMs: number
) {
  await act(async () => {
    await ref.current!.startRecording({ silenceTimeoutMs });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VoiceRecordButton – silence detection (wake-word path)', () => {

  it('does NOT auto-stop when no silenceTimeoutMs is given (manual recording)', async () => {
    const { ref } = renderButton();
    await act(async () => { await ref.current!.startRecording(); });

    expect(MockMediaRecorder.instances).toHaveLength(1);
    const rec = latestRecorder();
    expect(rec.start).toHaveBeenCalledTimes(1);

    // Advance well past any silence threshold — should NOT have stopped
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(rec.stop).not.toHaveBeenCalled();
    // No AudioContext should have been created either
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('creates an AudioContext when silenceTimeoutMs is provided', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1800);
    expect(MockAudioContext.instances).toHaveLength(1);
  });

  it('does not auto-stop during the 500 ms initial grace period', async () => {
    const { ref } = renderButton();
    // Analyser returns silence from the start
    latestAudioCtx()?.analyser.simulateSilence(); // ensure silence (default)
    await startWithSilenceTimeout(ref, 1000);

    const rec = latestRecorder();
    expect(rec.start).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(400); }); // < 500 ms grace
    expect(rec.stop).not.toHaveBeenCalled();
  });

  it('auto-stops after silenceTimeoutMs of continuous silence past the grace period', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1000);

    const audioCtx = latestAudioCtx();
    audioCtx.analyser.simulateSilence(); // silence throughout

    // Advance: 500ms grace + 1000ms silence threshold + one 150ms poll tick
    await act(async () => { vi.advanceTimersByTime(500 + 1000 + 150); });
    expect(latestRecorder().stop).toHaveBeenCalledTimes(1);
  });

  it('resets the silence timer when speech is detected', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1000);

    const audioCtx = latestAudioCtx();
    audioCtx.analyser.simulateSpeech(); // speaking from the start
    const rec = latestRecorder();

    // Advance past grace period + 800ms — still speaking, no stop
    await act(async () => { vi.advanceTimersByTime(500 + 800); });
    expect(rec.stop).not.toHaveBeenCalled();

    // User goes silent — timer resets to now
    audioCtx.analyser.simulateSilence();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(rec.stop).not.toHaveBeenCalled(); // only 800ms silent so far

    await act(async () => { vi.advanceTimersByTime(350); }); // now > 1000ms silent
    expect(rec.stop).toHaveBeenCalledTimes(1);
  });

  it('does not fire stopRecording twice (silence detect + manual stop)', async () => {
    const { ref } = renderButton();
    // Start with silence so silence-detection would eventually fire
    await startWithSilenceTimeout(ref, 1000);
    latestAudioCtx().analyser.simulateSilence();
    const rec = latestRecorder();

    // User manually stops before the silence threshold fires
    await act(async () => { ref.current!.stopRecording(false); });
    expect(rec.stop).toHaveBeenCalledTimes(1);

    // Advancing time should NOT cause a second stop
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(rec.stop).toHaveBeenCalledTimes(1);
  });

  it('cleans up AudioContext when manually stopped', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1000);
    const audioCtx = latestAudioCtx();
    expect(audioCtx._closed).toBe(false);

    await act(async () => { ref.current!.stopRecording(false); });
    expect(audioCtx._closed).toBe(true);
  });

  it('cleans up AudioContext when silence auto-stop fires', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1000);
    const audioCtx = latestAudioCtx();
    audioCtx.analyser.simulateSilence();

    await act(async () => { vi.advanceTimersByTime(500 + 1000 + 150); });
    expect(audioCtx._closed).toBe(true);
  });

  it('calls onRecordingStop with audio blob when silence auto-stop fires', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1000);
    const audioCtx = latestAudioCtx();
    const rec = latestRecorder();
    audioCtx.analyser.simulateSilence();

    // Simulate data chunks arriving before silence auto-stop
    act(() => {
      const fakeBlob = new Blob(['audio-data'], { type: 'audio/webm' });
      rec.ondataavailable?.({ data: fakeBlob } as BlobEvent);
    });

    await act(async () => { vi.advanceTimersByTime(500 + 1000 + 150); });
    // rec.stop() triggers rec.onstop() which triggers onRecordingStop
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
  });

  it('handles AudioContext creation failure gracefully (no crash)', async () => {
    // Replace with a regular (non-class) function that throws — avoids vi.fn issues
    (window as any).AudioContext = function () {
      throw new Error('AudioContext not available');
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ref } = renderButton();
    await expect(startWithSilenceTimeout(ref, 1000)).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Silence detection setup failed'),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('stops silence polling when MediaRecorder leaves recording state', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1000);
    const audioCtx = latestAudioCtx();
    const rec = latestRecorder();
    audioCtx.analyser.simulateSilence();

    // Force MediaRecorder into inactive state externally (e.g. max-duration auto-stop)
    rec.state = 'inactive';

    // The poll guard (mediaRecorder.state !== 'recording') fires, clears itself
    await act(async () => { vi.advanceTimersByTime(300); });
    // stop() should NOT have been called via silence path (state was already inactive)
    expect(rec.stop).not.toHaveBeenCalled();
  });
});

// ─── Integration: silence timeout → onRecordingStop ──────────────────────────

describe('end-to-end: wake word → silence → transcription pipeline', () => {
  it('provides an audio blob to onRecordingStop after silence auto-stop', async () => {
    const { ref } = renderButton();
    await startWithSilenceTimeout(ref, 1800);

    const audioCtx = latestAudioCtx();
    const rec = latestRecorder();

    // User speaks for a while
    audioCtx.analyser.simulateSpeech();
    const chunk1 = new Blob(['chunk1'], { type: 'audio/webm' });
    const chunk2 = new Blob(['chunk2'], { type: 'audio/webm' });
    act(() => {
      rec.ondataavailable?.({ data: chunk1 } as BlobEvent);
      rec.ondataavailable?.({ data: chunk2 } as BlobEvent);
    });

    // User pauses → silence detection starts
    await act(async () => { vi.advanceTimersByTime(500 + 800); });
    audioCtx.analyser.simulateSilence();

    // Silence window elapses → silence detection fires stopRecording
    await act(async () => { vi.advanceTimersByTime(1800 + 150); });
    expect(rec.stop).toHaveBeenCalledTimes(1);

    // onstop fires which triggers onRecordingStop with the collected blob
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
    const blob: Blob = onRecordingStop.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

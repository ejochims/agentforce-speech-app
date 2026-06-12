import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Tracks the live RMS level (0–1) of a MediaStream in a ref, updated per
 * animation frame. A ref (rather than state) lets canvas animation loops read
 * the level at 60fps without triggering React re-renders.
 */
export function useMicLevel(stream: MediaStream | null): MutableRefObject<number> {
  const levelRef = useRef(0);

  useEffect(() => {
    if (!stream) {
      levelRef.current = 0;
      return;
    }

    const AudioContextClass: typeof AudioContext | undefined =
      window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    let audioCtx: AudioContext;
    let source: MediaStreamAudioSourceNode;
    try {
      audioCtx = new AudioContextClass();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let rafId: number;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        // Samples are 0–255 with 128 as the silent centre line
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] - 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length) / 128; // 0–1
        // Speech RMS rarely exceeds ~0.25, so scale up for a useful 0–1 range
        levelRef.current = Math.min(1, rms * 4);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafId);
        try { source.disconnect(); } catch { /* ignore */ }
        audioCtx.close().catch(() => {});
        levelRef.current = 0;
      };
    } catch {
      // Audio analysis unavailable — orb falls back to its baseline animation
      return;
    }
  }, [stream]);

  return levelRef;
}

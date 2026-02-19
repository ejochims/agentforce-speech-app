import { useEffect, useState, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  stream?: MediaStream | null;
  height?: number;
  barClassName?: string;
}

export default function AudioVisualizer({ isActive, stream, height = 40, barClassName = 'bg-recording-active' }: AudioVisualizerProps) {
  const [bars, setBars] = useState<number[]>(Array(12).fill(0));
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      setBars(Array(12).fill(0));
      return;
    }

    if (stream) {
      // Real frequency analysis via Web Audio API AnalyserNode
      let audioCtx: AudioContext | null = null;
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        // Fall through to random fallback
      }

      if (audioCtx) {
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64; // 32 frequency bins
        analyser.smoothingTimeConstant = 0.7; // Smooth rapid changes
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const animate = () => {
          analyser.getByteFrequencyData(dataArray);
          // Map 32 frequency bins to 12 bars, weighting mid-range frequencies
          const newBars = Array(12).fill(0).map((_, i) => {
            const binIndex = Math.floor(i * (dataArray.length / 12));
            return (dataArray[binIndex] / 255) * 100;
          });
          setBars(newBars);
          animFrameRef.current = requestAnimationFrame(animate);
        };
        animate();

        return () => {
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          try { source.disconnect(); } catch {}
          audioCtx?.close().catch(() => {});
        };
      }
    }

    // Fallback: animated random bars when no stream is available
    const interval = setInterval(() => {
      setBars(Array(12).fill(0).map(() => Math.random() * 100));
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, stream]);

  if (!isActive) return null;

  return (
    <div
      className="flex items-end justify-center gap-xs px-lg"
      style={{ height: `${height}px` }}
      data-testid="audio-visualizer"
    >
      {bars.map((bar, index) => (
        <div
          key={index}
          className={`${barClassName} rounded-full transition-all duration-75 ease-out min-h-1`}
          style={{
            height: `${Math.max(4, (bar / 100) * height)}px`,
            width: '3px',
          }}
        />
      ))}
    </div>
  );
}

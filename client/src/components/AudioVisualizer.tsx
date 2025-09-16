import { useEffect, useState } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  height?: number;
}

export default function AudioVisualizer({ isActive, height = 40 }: AudioVisualizerProps) {
  const [bars, setBars] = useState<number[]>(Array(12).fill(0));

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive) {
      // Simulate audio visualization with random heights
      interval = setInterval(() => {
        setBars(prev => prev.map(() => Math.random() * 100));
      }, 100);
    } else {
      setBars(Array(12).fill(0));
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

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
          className="bg-recording-active rounded-full transition-all duration-100 ease-out min-h-1"
          style={{
            height: `${Math.max(4, (bar / 100) * height)}px`,
            width: '3px',
          }}
        />
      ))}
    </div>
  );
}
import { useState } from 'react';
import AudioVisualizer from '../AudioVisualizer';
import { Button } from '@/components/ui/button';

export default function AudioVisualizerExample() {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="p-8 bg-background space-y-4">
      <div className="text-center">
        <Button onClick={() => setIsActive(!isActive)}>
          {isActive ? 'Stop' : 'Start'} Visualization
        </Button>
      </div>
      <AudioVisualizer isActive={isActive} />
    </div>
  );
}
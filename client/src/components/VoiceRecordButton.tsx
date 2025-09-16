import { useState, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceRecordButtonProps {
  onRecordingStart?: () => void;
  onRecordingStop?: (audioBlob?: Blob) => void;
  disabled?: boolean;
}

export default function VoiceRecordButton({ 
  onRecordingStart, 
  onRecordingStop, 
  disabled = false 
}: VoiceRecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      audioChunks.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        onRecordingStop?.(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      mediaRecorder.current = recorder;
      setIsRecording(true);
      onRecordingStart?.();
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      console.log('Recording stopped');
    }
  };

  const handleMouseDown = () => {
    if (!disabled) {
      setIsPressed(true);
      startRecording();
    }
  };

  const handleMouseUp = () => {
    setIsPressed(false);
    stopRecording();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsPressed(true);
      startRecording();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsPressed(false);
    stopRecording();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="icon"
        disabled={disabled}
        className={`
          w-20 h-20 rounded-full transition-all duration-200 
          ${isRecording 
            ? 'bg-recording-active border-2 border-recording-active/30 shadow-lg shadow-recording-active/20' 
            : 'bg-voice-primary hover:bg-voice-primary/90'
          }
          ${isPressed ? 'scale-95' : 'scale-100'}
          ${isRecording ? 'animate-pulse' : ''}
        `}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-testid="button-voice-record"
      >
        {isRecording ? (
          <MicOff className="w-8 h-8 text-white" />
        ) : (
          <Mic className="w-8 h-8 text-white" />
        )}
      </Button>
      
      <p className="text-sm text-muted-foreground font-medium">
        {isRecording ? 'Release to stop' : 'Hold to speak'}
      </p>
    </div>
  );
}
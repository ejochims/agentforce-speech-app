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
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      console.log('Attempting to start recording...');
      
      // Check for media device support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('Media devices not supported in this browser');
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Got media stream:', stream);
      
      const recorder = new MediaRecorder(stream);
      console.log('Created MediaRecorder:', recorder);
      
      audioChunks.current = [];
      
      recorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        console.log('MediaRecorder stopped, processing audio...');
        // Use the actual mime type from MediaRecorder instead of forcing audio/wav
        const actualMimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks.current, { type: actualMimeType });
        console.log('Created audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
        onRecordingStop?.(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start(100); // Record in 100ms chunks for better data capture
      mediaRecorder.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);
      startTimeRef.current = Date.now();
      
      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingDuration(duration);
      }, 100);
      
      onRecordingStart?.();
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Error starting recording:', error);
      // Still call the start handler to show UI feedback even if recording fails
      onRecordingStart?.();
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      const recordingTime = Date.now() - startTimeRef.current;
      console.log(`Stopping recording after ${recordingTime}ms...`);
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      // Check if recording is too short
      if (recordingTime < 500) { // Less than 0.5 seconds
        console.warn('Recording too short, may not contain audio data');
      }
      
      mediaRecorder.current.stop();
      setIsRecording(false);
      setRecordingDuration(0);
      console.log('Recording stopped');
    }
  };

  const handleToggleRecording = () => {
    if (disabled) return;
    
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="icon"
        disabled={disabled}
        className={`
          w-20 h-20 rounded-full transition-all duration-200 
          ${isRecording 
            ? 'bg-recording-active border-2 border-recording-active/30 shadow-lg shadow-recording-active/20 animate-pulse' 
            : 'bg-voice-primary hover:bg-voice-primary/90'
          }
        `}
        onClick={handleToggleRecording}
        data-testid="button-voice-record"
      >
        {isRecording ? (
          <MicOff className="w-8 h-8 text-white" />
        ) : (
          <Mic className="w-8 h-8 text-white" />
        )}
      </Button>
      
      <p className="text-sm text-muted-foreground font-medium">
        {isRecording 
          ? `Recording... ${recordingDuration}s` 
          : 'Tap to record'
        }
      </p>
    </div>
  );
}
import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AudioVisualizer from './AudioVisualizer';

type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

interface VoiceRecordButtonProps {
  onBeforeRecording?: () => Promise<void> | void; // Called BEFORE recording starts
  onRecordingStart?: () => void;
  onRecordingStop?: (audioBlob?: Blob) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  state?: RecordingState;
  error?: string;
  onRetry?: () => void;
}

export default function VoiceRecordButton({ 
  onBeforeRecording,
  onRecordingStart, 
  onRecordingStop, 
  onError,
  disabled = false,
  state = 'idle',
  error,
  onRetry
}: VoiceRecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Haptic feedback helper
  const triggerHapticFeedback = (pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        // Silently handle vibration failures
        console.debug('Vibration not supported or failed:', error);
      }
    }
  };

  const startRecording = async () => {
    try {
      console.log('Attempting to start recording...');
      
      // CRITICAL: Call onBeforeRecording FIRST (e.g., to unlock audio on Safari iOS)
      // This must happen before mic access to avoid conflicts
      if (onBeforeRecording) {
        console.log('🎯 Calling onBeforeRecording hook...');
        await onBeforeRecording();
        console.log('✓ onBeforeRecording completed');
      }
      
      // Check for media device support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'Audio recording is not supported in this browser';
        console.error(errorMsg);
        onError?.(errorMsg);
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Got media stream:', stream);
      
      // Force webm format for better compatibility with OpenAI Whisper
      const options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      }
      
      const recorder = new MediaRecorder(stream, options);
      console.log('Created MediaRecorder:', recorder, 'with options:', options);
      
      audioChunks.current = [];
      
      recorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        console.log('MediaRecorder stopped, processing audio...');
        
        // Only process if we have audio chunks (not cancelled)
        if (audioChunks.current.length > 0) {
          // Use the actual mime type from MediaRecorder instead of forcing audio/wav
          const actualMimeType = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunks.current, { type: actualMimeType });
          console.log('Created audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
          onRecordingStop?.(audioBlob);
        }
        
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
      
      // Trigger haptic feedback on successful recording start
      triggerHapticFeedback(10);
      
      onRecordingStart?.();
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Error starting recording:', error);
      
      // Handle different types of recording errors
      let errorMessage = 'Recording failed';
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError' || error.name === 'DeviceNotFoundError') {
          errorMessage = 'No microphone found. Please check your audio device and try again.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = 'Microphone is busy or not accessible. Please close other apps using the microphone and try again.';
        } else {
          errorMessage = error.message || errorMessage;
        }
      }
      
      // CRITICAL FIX: Do NOT call onRecordingStart when there's an error
      // Instead, surface the error properly
      onError?.(errorMessage);
    }
  };

  const stopRecording = useCallback((cancelled: boolean = false) => {
    if (mediaRecorder.current && isRecording) {
      const recordingTime = Date.now() - startTimeRef.current;
      console.log(`${cancelled ? 'Cancelling' : 'Stopping'} recording after ${recordingTime}ms...`);
      
      // Trigger haptic feedback
      triggerHapticFeedback(20);
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      if (cancelled) {
        // Clear audio chunks to prevent processing
        audioChunks.current = [];
        // Just stop the recorder without processing
        mediaRecorder.current.stop();
        setIsRecording(false);
        setRecordingDuration(0);
        console.log('Recording cancelled');
        return;
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
  }, [isRecording]);

  const handleToggleRecording = () => {
    if (disabled || state === 'processing') return;
    
    if (state === 'error' && onRetry) {
      onRetry();
      return;
    }
    
    if (isRecording) {
      stopRecording(false);
    } else {
      startRecording();
    }
  };
  
  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleRecording();
    } else if (e.key === 'Escape' && state === 'recording') {
      e.preventDefault();
      stopRecording(false);
    }
  };

  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getButtonClassName = () => {
    const baseClasses = 'w-20 h-20 rounded-full transition-all duration-300 relative overflow-visible touch-target';
    
    if (disabled) {
      return `${baseClasses} bg-recording-inactive text-recording-inactive-foreground cursor-not-allowed`;
    }
    
    switch (state) {
      case 'recording':
        return `${baseClasses} bg-recording-active text-recording-active-foreground shadow-lg shadow-recording-active/20 animate-pulse`;
      case 'processing':
        return `${baseClasses} bg-voice-processing text-voice-processing-foreground cursor-wait`;
      case 'error':
        return `${baseClasses} bg-voice-error text-voice-error-foreground hover-elevate`;
      default:
        return `${baseClasses} bg-voice-primary text-voice-primary-foreground hover-elevate active-elevate-2`;
    }
  };
  
  const getStatusText = () => {
    if (disabled) return 'Recording disabled';
    
    switch (state) {
      case 'recording':
        return `Recording... ${formatDuration(recordingDuration)}`;
      case 'processing':
        return 'Processing audio...';
      case 'error':
        return error || 'Recording failed • Tap to retry';
      default:
        return 'Tap to record';
    }
  };
  
  const getIcon = () => {
    switch (state) {
      case 'recording':
        return <MicOff className="w-8 h-8" />;
      case 'processing':
        return <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />;
      case 'error':
        return <AlertCircle className="w-8 h-8" />;
      default:
        return <Mic className="w-8 h-8" />;
    }
  };
  
  return (
    <div className="flex flex-col items-center gap-lg">
      {/* Screen reader announcements for accessibility */}
      <div 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
        role="status"
        data-testid="voice-record-status-announcer"
      >
        {getStatusText()}
      </div>
      
      {/* Audio Visualizer - Show during recording */}
      {state === 'recording' && (
        <div className="transition-all duration-300" role="img" aria-label="Audio visualization showing voice input levels">
          <AudioVisualizer isActive={true} height={32} />
        </div>
      )}
      
      {/* Recording Button */}
      <div className="relative flex flex-col items-center">
        
        
        <Button
          ref={buttonRef}
          size="icon"
          disabled={disabled}
          className={`${getButtonClassName()} ${
            state === 'recording' ? 'animate-recording-breathe' : ''
          }`}
          onClick={handleToggleRecording}
          onKeyDown={handleKeyDown}
          data-testid="button-voice-record"
          aria-label={getStatusText()}
          aria-pressed={state === 'recording'}
          aria-describedby={state === 'recording' ? 'recording-instructions' : undefined}
          role="button"
          tabIndex={disabled ? -1 : 0}
        >
          {getIcon()}
          
          {/* Enhanced pulse animation for recording state */}
          {state === 'recording' && (
            <div className="absolute inset-0 rounded-full border-2 border-recording-active animate-recording-pulse opacity-75" />
          )}
        </Button>
      </div>
      
      {/* Status Text */}
      <div className="text-center">
        <p 
          id="recording-instructions"
          className={`text-sm font-medium transition-colors duration-200 ${
            state === 'error' 
              ? 'text-destructive' 
              : 'text-muted-foreground'
          }`}
        >
          {getStatusText()}
        </p>
        
        {/* Additional error details */}
        {state === 'error' && error && (
          <p className="text-xs text-muted-foreground mt-xs" role="alert">
            {error}
          </p>
        )}
        
        {/* Hidden instructions for screen readers */}
        {state === 'recording' && (
          <p className="sr-only" aria-live="polite">
            Recording your message. Tap the button again to stop recording.
          </p>
        )}
      </div>
    </div>
  );
}
import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Mic, MicOff, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AudioVisualizer from './AudioVisualizer';
import { motion } from 'framer-motion';

type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

export interface VoiceRecordButtonHandle {
  startRecording: () => Promise<void>;
  stopRecording: (cancelled?: boolean) => void;
}

interface VoiceRecordButtonProps {
  onBeforeRecording?: () => Promise<void> | void; // Called BEFORE recording starts
  onRecordingStart?: () => void;
  onRecordingStop?: (audioBlob?: Blob) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  state?: RecordingState;
  error?: string;
  onRetry?: () => void;
  maxDuration?: number; // seconds, default 120
  showStatusText?: boolean;
}

const VoiceRecordButton = forwardRef<VoiceRecordButtonHandle, VoiceRecordButtonProps>(function VoiceRecordButton({
  onBeforeRecording,
  onRecordingStart,
  onRecordingStop,
  onError,
  disabled = false,
  state = 'idle',
  error,
  onRetry,
  maxDuration = 120,
  showStatusText = true,
}, ref) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Refs for reliable PTT state (don't depend on React render cycle)
  const isStartingRef = useRef(false);   // true while getUserMedia/setup is in progress
  const pendingStopRef = useRef(false);  // true if stop was requested before setup finished

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
    // Guard: don't allow concurrent starts
    if (isStartingRef.current || mediaRecorder.current?.state === 'recording') {
      console.log('startRecording: already starting or recording, ignoring');
      return;
    }
    isStartingRef.current = true;
    pendingStopRef.current = false;

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
      setLiveStream(stream);
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
        setLiveStream(null);

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
      isStartingRef.current = false; // setup complete

      // If stop was requested while we were setting up, honour it now
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        recorder.stop();
        stream.getTracks().forEach(track => track.stop());
        console.log('Recording immediately stopped (pending stop from PTT release)');
        return;
      }

      setIsRecording(true);
      setRecordingDuration(0);
      startTimeRef.current = Date.now();

      // Start duration counter + auto-stop at maxDuration
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingDuration(elapsed);

        if (elapsed >= maxDuration && mediaRecorder.current?.state === 'recording') {
          clearInterval(durationIntervalRef.current!);
          durationIntervalRef.current = null;
          mediaRecorder.current.stop();
          setIsRecording(false);
          setRecordingDuration(0);
          triggerHapticFeedback([10, 50, 10]);
        }
      }, 100);

      // Trigger haptic feedback on successful recording start
      triggerHapticFeedback(10);

      onRecordingStart?.();
      console.log('Recording started successfully');
    } catch (error) {
      isStartingRef.current = false;
      pendingStopRef.current = false;
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
    // If still setting up (getUserMedia hasn't finished), queue a pending stop
    if (isStartingRef.current) {
      console.log('stopRecording: recording still starting — queuing pending stop');
      pendingStopRef.current = true;
      return;
    }

    // Use the ref state (synchronous) rather than React state (async) for reliability
    if (mediaRecorder.current?.state === 'recording') {
      const recordingTime = Date.now() - startTimeRef.current;
      console.log(`${cancelled ? 'Cancelling' : 'Stopping'} recording after ${recordingTime}ms...`);

      triggerHapticFeedback(20);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (cancelled) {
        audioChunks.current = [];
        mediaRecorder.current.stop();
        setIsRecording(false);
        setRecordingDuration(0);
        console.log('Recording cancelled');
        return;
      }

      if (recordingTime < 500) {
        console.warn('Recording too short, may not contain audio data');
      }

      mediaRecorder.current.stop();
      setIsRecording(false);
      setRecordingDuration(0);
      console.log('Recording stopped');
    }
  }, []); // no dependency on isRecording — uses refs for reliability

  // Expose imperative API so parent can trigger recording programmatically (e.g. Space PTT)
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
  }));

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
        return `${baseClasses} bg-recording-active text-recording-active-foreground shadow-lg shadow-recording-active/20`;
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
      case 'recording': {
        const remaining = maxDuration - recordingDuration;
        const timeStr = formatDuration(recordingDuration);
        if (remaining <= 10) return `Recording... ${timeStr} · ${remaining}s left`;
        if (remaining <= 30) return `Recording... ${timeStr} · ${remaining}s`;
        return `Recording... ${timeStr}`;
      }
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
          <AudioVisualizer isActive={true} stream={liveStream} height={56} />
        </div>
      )}
      
      {/* Recording Button */}
      <div className="relative flex flex-col items-center">
        <motion.div
          animate={state === 'recording' ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={
            state === 'recording'
              ? { repeat: Infinity, duration: 1.6, ease: 'easeInOut' }
              : { type: 'spring', stiffness: 400, damping: 20 }
          }
          whileHover={disabled || state === 'processing' ? undefined : { scale: 1.07 }}
          whileTap={disabled ? undefined : { scale: 0.91 }}
        >
          <Button
            ref={buttonRef}
            size="icon"
            disabled={disabled}
            className={getButtonClassName()}
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

            {/* Expanding ring while recording */}
            {state === 'recording' && (
              <div className="absolute inset-0 rounded-full border-2 border-recording-active animate-recording-pulse opacity-75" />
            )}
          </Button>
        </motion.div>
      </div>
      
      {/* Status Text */}
      <div className="text-center">
        {showStatusText && state !== 'idle' && (
          <>
            <p
              id="recording-instructions"
              className={`text-sm font-medium transition-colors duration-200 ${
                state === 'error'
                  ? 'text-destructive'
                  : state === 'recording' && recordingDuration >= maxDuration - 10
                  ? 'text-destructive'
                  : state === 'recording' && recordingDuration >= maxDuration - 30
                  ? 'text-amber-500'
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
          </>
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
});

export default VoiceRecordButton;
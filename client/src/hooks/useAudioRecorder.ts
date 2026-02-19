import { useState } from 'react';

export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

export interface SttTransparency {
  sttProcessingMs: number;
  audioSizeBytes: number;
  mimeType: string;
}

interface UseAudioRecorderConfig {
  onTranscription: (text: string, sttTransparency: SttTransparency | null) => void;
}

export function useAudioRecorder({ onTranscription }: UseAudioRecorderConfig) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const handleRecordingStart = () => {
    setIsRecording(true);
    setRecordingState('recording');
    setRecordingError(null);
    console.log('Voice recording started');
  };

  const handleRecordingError = (error: string) => {
    console.error('Recording error:', error);
    setIsRecording(false);
    setRecordingState('error');
    setRecordingError(error);
  };

  const handleRecordingStop = async (audioBlob?: Blob) => {
    setIsRecording(false);
    console.log('Voice recording stopped', audioBlob?.size, 'bytes');

    if (!audioBlob) {
      setRecordingState('idle');
      return;
    }

    if (audioBlob.size === 0 || audioBlob.size < 100) {
      console.error('Audio recording is empty or too small:', audioBlob.size, 'bytes');
      setRecordingError('Recording too short or empty. Please hold the button longer and speak clearly.');
      setRecordingState('error');
      return;
    }

    setRecordingState('processing');

    try {
      const formData = new FormData();
      let fileExtension = 'wav';
      if (audioBlob.type.includes('webm')) fileExtension = 'webm';
      else if (audioBlob.type.includes('mp4')) fileExtension = 'm4a';
      else if (audioBlob.type.includes('ogg')) fileExtension = 'ogg';

      console.log('Sending audio file:', `recording.${fileExtension}`, 'with type:', audioBlob.type);
      formData.append('file', audioBlob, `recording.${fileExtension}`);

      const sttResponse = await fetch('/api/stt', { method: 'POST', body: formData });

      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        let errorJson: any;
        try { errorJson = JSON.parse(errorText); } catch { /* not JSON */ }
        const details = { status: sttResponse.status, body: errorJson || errorText };
        console.error('STT API Error details:', details);
        throw new Error(`STT failed: ${sttResponse.status} ${errorJson?.error || errorText}`);
      }

      const sttResult = await sttResponse.json();
      const { text, transparency } = sttResult;
      console.log('Transcribed text:', text);

      if (text.trim()) {
        onTranscription(text, transparency || null);
        setRecordingState('idle');
      } else {
        setRecordingError('No speech detected. Please speak clearly and try again.');
        setRecordingState('error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process recording';
      console.error('Error processing voice:', error);
      setRecordingError(`Processing failed: ${message}`);
      setRecordingState('error');
    }
  };

  const resetError = () => {
    setRecordingError(null);
    setRecordingState('idle');
  };

  return {
    isRecording,
    recordingState,
    recordingError,
    handleRecordingStart,
    handleRecordingStop,
    handleRecordingError,
    resetError,
  };
}

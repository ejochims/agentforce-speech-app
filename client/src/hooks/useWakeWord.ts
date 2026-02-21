import { useEffect, useRef, useState, useCallback } from 'react';

// Phrases detected as substrings in the continuous transcript.
// Kept short and phonetically distinct so they survive noisy STT.
// 'agentforce' alone is a safe fallback — wake word is paused during TTS
// so the agent's own spoken response can't accidentally retrigger it.
const WAKE_PHRASES = ['hey agentforce', 'hey agent force', 'hey agent', 'agentforce'];

// Minimum ms between detections — prevents a single recognition result
// from firing the callback multiple times if the phrase spans results.
const DETECTION_DEBOUNCE_MS = 2000;

interface UseWakeWordOptions {
  enabled: boolean;
  isPipelineBusy: boolean; // pause wake word detection while pipeline is active
  onDetected: () => void;
}

export function useWakeWord({ enabled, isPipelineBusy, onDetected }: UseWakeWordOptions) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Refs avoid stale closures inside recognition callbacks
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeRef = useRef(false);          // intent: should recognition be running?
  const busyRef = useRef(isPipelineBusy);   // pipeline state
  const onDetectedRef = useRef(onDetected); // latest callback ref
  const lastDetectionRef = useRef(0);       // timestamp of last detection (debounce)
  const startFnRef = useRef<() => void>(() => {}); // self-referential start

  // Keep refs in sync with latest prop values
  useEffect(() => { busyRef.current = isPipelineBusy; }, [isPipelineBusy]);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  // Detect browser support once on mount
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    setIsSupported(supported);
  }, []);

  const stopCurrent = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    if (busyRef.current) return;
    if (!activeRef.current) return;

    // Tear down any previous instance before creating a new one
    stopCurrent();

    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true; // interim lets us catch the phrase as the user speaks it
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();
        const matched = WAKE_PHRASES.some(phrase => transcript.includes(phrase));

        if (matched) {
          const now = Date.now();
          if (now - lastDetectionRef.current < DETECTION_DEBOUNCE_MS) return;
          lastDetectionRef.current = now;

          console.log('🎙️ Wake word detected:', transcript);
          activeRef.current = false; // prevent auto-restart during the pipeline

          // Override onend for THIS instance so that onDetected is called only
          // AFTER the recognition has fully stopped and released the microphone.
          // Calling getUserMedia() while SpeechRecognition still holds the mic
          // causes a silent failure on iOS (NotReadableError).
          recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
            onDetectedRef.current();
          };
          try { recognition.stop(); } catch { /* ignore */ }
          return;
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' happens constantly in silence — it's normal, not an error
      if (event.error !== 'no-speech' && event.error !== 'audio-capture') {
        console.warn('Wake word recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Auto-restart so that detection is continuous — Web Speech API always
      // stops after a period of silence or after a result.
      if (activeRef.current && !busyRef.current) {
        setTimeout(() => {
          if (activeRef.current && !busyRef.current) {
            startFnRef.current();
          }
        }, 400);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.warn('Wake word recognition start failed:', err);
      recognitionRef.current = null;
    }
  }, [stopCurrent]); // stopCurrent is stable; all other state accessed via refs

  // Keep startFnRef pointing at the latest start implementation
  useEffect(() => { startFnRef.current = start; }, [start]);

  // React to changes in enabled / isPipelineBusy
  useEffect(() => {
    if (!isSupported) return;

    if (enabled && !isPipelineBusy) {
      activeRef.current = true;
      start();
    } else {
      activeRef.current = false;
      stopCurrent();
    }
  }, [enabled, isPipelineBusy, isSupported, start, stopCurrent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      stopCurrent();
    };
  }, [stopCurrent]);

  return { isSupported, isListening };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { safeStorage } from '@/lib/safeStorage';

export function useTextToSpeech() {
  const [audioEnabled, setAudioEnabled] = useState<boolean>(
    () => safeStorage.getItem('audioEnabled') === 'true'
  );
  const [showAudioPrompt, setShowAudioPrompt] = useState<boolean>(
    () => safeStorage.getItem('audioEnabled') === null
  );
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [pendingAudioText, setPendingAudioText] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isTtsFetching, setIsTtsFetching] = useState(false);

  // Refs for Safari iOS audio unlock pattern
  const blessedAudioRef = useRef<HTMLAudioElement | null>(null);
  const isAudioUnlockingRef = useRef(false);
  const currentPlayingAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Always-current refs avoid stale closures in callbacks
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  // Keep audioContextRef in sync with audioContext state so playTextAsAudio
  // can read it without needing it in the dependency array.
  const audioContextRef = useRef<AudioContext | null>(null);
  audioContextRef.current = audioContext;

  // Sequential TTS queue — prevents early-TTS and remainder from overlapping.
  // Both calls resolve in order; the second waits for the first to finish.
  const ttsQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  // Incrementing this cancels all in-flight/queued TTS (used by stopAudio).
  const ttsGenerationRef = useRef(0);

  // Restore audio context for returning users who previously enabled audio
  useEffect(() => {
    if (safeStorage.getItem('audioEnabled') === 'true') {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
        console.log('✓ Audio context restored for returning user');
      } catch (error) {
        console.error('❌ Failed to restore audio context:', error);
        setAudioEnabled(false);
        safeStorage.setItem('audioEnabled', 'false');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const playTextAsAudio = useCallback(async (text: string): Promise<boolean> => {
    if (!audioEnabledRef.current) {
      console.log('🔇 Audio disabled, storing as pending');
      setPendingAudioText(text);
      return false;
    }

    // Capture generation at call-time. stopAudio() increments it to cancel work.
    const generation = ttsGenerationRef.current;

    const doPlay = async (): Promise<boolean> => {
      // Bail out if audio was disabled or stopAudio() was called while queued.
      if (!audioEnabledRef.current || generation !== ttsGenerationRef.current) return false;

      setIsTtsFetching(true);
      console.log('🎵 Playing TTS audio:', text.substring(0, 50) + '...');
      const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=allison`;

      // --- Primary path: Web Audio API ---
      // More reliable on iOS Safari than HTMLAudioElement src-swapping: once an
      // AudioContext has been resumed inside a user gesture it can decode and play
      // buffers at any time without another gesture.
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== 'closed') {
        try {
          if (ctx.state === 'suspended') {
            console.log('🔊 Resuming suspended AudioContext...');
            await ctx.resume();
          }
          // On iOS, ctx.resume() outside a user gesture resolves but leaves the
          // context suspended. Detect this and fall through to HTMLAudioElement
          // (which uses the blessed element that was unlocked during the gesture).
          if (ctx.state === 'suspended') {
            throw new Error('AudioContext still suspended after resume — outside gesture on iOS');
          }
          if (generation !== ttsGenerationRef.current) { setIsTtsFetching(false); return false; }

          console.log('🎵 Fetching TTS audio for Web Audio API...');
          const response = await fetch(audioUrl);
          if (!response.ok) throw new Error(`TTS fetch failed: ${response.status}`);
          if (generation !== ttsGenerationRef.current) { setIsTtsFetching(false); return false; }

          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          if (generation !== ttsGenerationRef.current) { setIsTtsFetching(false); return false; }

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          currentBufferSourceRef.current = source;

          setIsTtsFetching(false);
          setIsAudioPlaying(true);

          return new Promise((resolve) => {
            source.onended = () => {
              console.log('✓ Web Audio playback completed');
              // Only clear the ref if it still points to this source — stopAudio()
              // may have already replaced or cleared it.
              if (currentBufferSourceRef.current === source) currentBufferSourceRef.current = null;
              setIsAudioPlaying(false);
              resolve(true);
            };
            source.start(0);
            console.log('✓ Web Audio playback started');
          });
        } catch (webAudioError) {
          console.error('❌ Web Audio playback failed, falling back to HTMLAudioElement:', webAudioError);
          // Clear any orphaned source ref (may have been set before the error).
          currentBufferSourceRef.current = null;
          // isTtsFetching stays true — the HTMLAudioElement path takes over below.
        }
      }

      // --- Fallback path: HTMLAudioElement ---
      // Uses the blessed element on iOS (preserves gesture unlock).
      if (generation !== ttsGenerationRef.current) { setIsTtsFetching(false); return false; }

      let audio: HTMLAudioElement;
      if (blessedAudioRef.current) {
        console.log('🎵 Reusing blessed audio element for Safari iOS');
        audio = blessedAudioRef.current;
        // Always pause and reset before changing src — ended audio has
        // paused===true so the old `if (!paused)` guard skipped this,
        // leaving currentTime at the end which breaks replay on iOS.
        audio.pause();
        audio.currentTime = 0;
        audio.src = audioUrl;
      } else {
        console.log('🎵 Creating new audio element (desktop)');
        audio = new Audio();
        audio.preload = 'auto';
        audio.src = audioUrl;
        (audio as any).playsInline = true;
      }

      audio.muted = false;
      audio.volume = 1.0;

      // The promise must resolve only when audio *ends* (or fails), not when it
      // starts — otherwise the queue releases the next TTS immediately and two
      // clips play simultaneously, recreating the original race condition.
      return new Promise((resolve) => {
        let resolved = false;
        let safariPoll: ReturnType<typeof setInterval> | null = null;

        const done = (success: boolean) => {
          if (resolved) return;
          resolved = true;
          if (safariPoll !== null) { clearInterval(safariPoll); safariPoll = null; }
          cleanup();
          resolve(success);
        };

        const onEnded = () => {
          console.log('✓ Audio playback completed');
          if (currentPlayingAudioRef.current === audio) currentPlayingAudioRef.current = null;
          setIsAudioPlaying(false);
          done(true);
        };

        // Safari iOS sometimes skips the 'ended' event for streamed audio.
        const onPause = () => {
          if (audio.ended) {
            console.log('✓ Audio ended via pause fallback (Safari iOS)');
            onEnded();
          }
        };

        const onError = () => {
          console.error('❌ Audio loading/decoding error (TTS fetch may have failed)');
          setIsTtsFetching(false);
          setIsAudioPlaying(false);
          if (generation === ttsGenerationRef.current) setPendingAudioText(text);
          done(false);
        };

        const cleanup = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('pause', onPause);
          audio.removeEventListener('error', onError);
        };

        audio.addEventListener('ended', onEnded);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('error', onError);

        console.log('🎵 Calling audio.play() directly...');
        audio.play()
          .then(() => {
            console.log('✓ Audio playback started');
            currentPlayingAudioRef.current = audio;
            setIsTtsFetching(false);
            setIsAudioPlaying(true);
            // Do NOT call done() here — wait for onEnded/onError so the queue
            // holds until this clip finishes before starting the next one.

            // Safari iOS sometimes never fires 'ended' or 'pause+ended' for
            // streamed audio. Poll every 250 ms as a guaranteed escape hatch.
            safariPoll = setInterval(() => {
              if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) {
                console.warn('⚠️ audio.ended detected via poll (Safari fallback)');
                onEnded();
              }
            }, 250);
          })
          .catch((playError) => {
            console.error('❌ audio.play() rejected:', playError.name, playError.message);
            onError();
          });
      });
    };

    // Chain onto the queue so concurrent calls (early TTS + remainder) play
    // sequentially rather than overlapping and corrupting shared state.
    const thisPlay = ttsQueueRef.current.then(doPlay, doPlay);
    ttsQueueRef.current = thisPlay.then(() => true, () => true);
    return thisPlay;
  }, []); // stable — reads all mutable values via refs

  const initializeAudio = useCallback(async () => {
    try {
      console.log('🔊 Initializing audio context...');
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();

      // Unlock HTML5 audio for Safari iOS (fallback path) and save as the
      // blessed element so HTMLAudioElement TTS works without a gesture later.
      console.log('🔓 Unlocking HTML5 audio for iOS Safari...');
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAAA==';
      (silentAudio as any).playsInline = true;
      try {
        await silentAudio.play();
        silentAudio.pause();
        silentAudio.currentTime = 0;
        console.log('✓ HTML5 audio unlocked');
      } catch (e) { console.log('⚠️ HTML5 audio unlock failed (may work anyway):', e); }
      if (!blessedAudioRef.current) blessedAudioRef.current = silentAudio;

      setAudioContext(ctx);
      // Eagerly sync ref so playTextAsAudio below can use the Web Audio path
      // before the React state update triggers a re-render.
      audioContextRef.current = ctx;
      setAudioEnabled(true);
      audioEnabledRef.current = true;
      setShowAudioPrompt(false);
      safeStorage.setItem('audioEnabled', 'true');
      console.log('✓ Audio context initialized');

      if (pendingAudioText) {
        console.log('🎵 Playing pending audio text:', pendingAudioText.substring(0, 50) + '...');
        const played = await playTextAsAudio(pendingAudioText);
        if (played) setPendingAudioText(null);
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize audio:', error);
      setAudioEnabled(false);
      safeStorage.setItem('audioEnabled', 'false');
      return false;
    }
  }, [pendingAudioText, playTextAsAudio]);

  const disableAudio = useCallback(() => {
    console.log('🔇 Disabling audio...');
    if (audioContext) { audioContext.close(); setAudioContext(null); }
    setAudioEnabled(false);
    audioEnabledRef.current = false;
    setShowAudioPrompt(false);
    setIsTtsFetching(false);
    setPendingAudioText(null);
    safeStorage.setItem('audioEnabled', 'false');
  }, [audioContext]);

  // Must be called during a user gesture (before recording) to unlock Safari iOS audio
  const unlockAudioForSafari = useCallback(async () => {
    // Create or resume an AudioContext inside the user gesture. This is the only
    // reliable way to unblock Web Audio playback on iOS Safari:
    //  - First-time users: no context exists yet → create one now (it starts running).
    //  - Returning users: context was created at mount time outside a gesture → iOS
    //    suspends it immediately; resume it here so it's running for TTS later.
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') {
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx; // eagerly sync ref before state update
        setAudioContext(ctx);
        console.log('✓ AudioContext created during user gesture');
      } catch (e) {
        console.warn('⚠️ Failed to create AudioContext:', e);
      }
    }
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
        console.log('✓ AudioContext resumed on user gesture');
      } catch (e) {
        console.warn('⚠️ Failed to resume AudioContext:', e);
      }
    }

    if (isAudioUnlockingRef.current || blessedAudioRef.current) return;
    isAudioUnlockingRef.current = true;
    try {
      console.log('🔓 Unlocking audio for Safari iOS on user gesture...');
      const audio = new Audio();
      (audio as any).playsInline = true;
      audio.preload = 'auto';
      audio.src = 'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAAA==';
      audio.muted = false;
      audio.volume = 0.01;
      try {
        await audio.play();
        console.log('✓ Audio unlocked for Safari iOS');
        audio.pause();
        audio.currentTime = 0;
      } catch (e) { console.warn('⚠️ Silent audio play failed (may still work):', e); }

      blessedAudioRef.current = audio;
      console.log('🎵 Created blessed audio element for Safari iOS');

      if (!audioEnabledRef.current) {
        console.log('🔊 Auto-enabling audio after successful unlock');
        setAudioEnabled(true);
        audioEnabledRef.current = true;
        safeStorage.setItem('audioEnabled', 'true');
        setShowAudioPrompt(false);
      }
    } finally {
      isAudioUnlockingRef.current = false;
    }
  }, []);

  const stopAudio = useCallback(() => {
    // Increment generation — cancels all queued and in-flight TTS fetches/decodes.
    ttsGenerationRef.current++;
    // Reset the queue so the next playTextAsAudio call starts immediately.
    ttsQueueRef.current = Promise.resolve(true);

    // Stop Web Audio BufferSource if active
    const bufferSource = currentBufferSourceRef.current;
    if (bufferSource) {
      try { bufferSource.stop(); } catch (e) { /* already stopped */ }
      currentBufferSourceRef.current = null;
    }
    // Stop HTMLAudioElement if active
    const audio = currentPlayingAudioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; currentPlayingAudioRef.current = null; }
    setIsTtsFetching(false);
    setIsAudioPlaying(false);
  }, []);

  return {
    audioEnabled,
    showAudioPrompt,
    pendingAudioText,
    isAudioPlaying,
    isTtsFetching,
    initializeAudio,
    disableAudio,
    playTextAsAudio,
    stopAudio,
    unlockAudioForSafari,
    setPendingAudioText,
    setShowAudioPrompt,
  };
}

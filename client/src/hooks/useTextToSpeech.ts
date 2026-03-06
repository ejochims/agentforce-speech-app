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

  // Always-current ref avoids stale closure in playTextAsAudio when called
  // immediately after setAudioEnabled(true) in initializeAudio
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

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

    setIsTtsFetching(true);
    console.log('🎵 Playing TTS audio:', text.substring(0, 50) + '...');
    const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=allison`;

    let audio: HTMLAudioElement;
    if (blessedAudioRef.current) {
      // Safari iOS: reuse the blessed element that was unlocked during a user gesture.
      // Call load() to reset any previous error state before setting the new src.
      console.log('🎵 Reusing blessed audio element for Safari iOS');
      audio = blessedAudioRef.current;
      audio.src = audioUrl;
      audio.load();
    } else {
      // Chrome/desktop: create a fresh element every time to avoid stale error states.
      console.log('🎵 Creating new audio element (desktop)');
      audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioUrl;
      (audio as any).playsInline = true;
    }

    audio.muted = false;
    audio.volume = 1.0;

    return new Promise((resolve) => {
      // Guard against settle() being called twice (e.g. play() rejection AND error event).
      let settled = false;
      const settle = (success: boolean) => {
        if (settled) return;
        settled = true;
        if (success) {
          currentPlayingAudioRef.current = audio;
          setIsTtsFetching(false);
          setIsAudioPlaying(true);
        } else {
          setIsTtsFetching(false);
          setIsAudioPlaying(false);
          setPendingAudioText(text);
          cleanup();
        }
        resolve(success);
      };

      const onEnded = () => {
        console.log('✓ Audio playback completed');
        currentPlayingAudioRef.current = null;
        setIsAudioPlaying(false);
        cleanup();
      };

      // Safari iOS sometimes skips the 'ended' event for streamed audio.
      // Listening to 'pause' with audio.ended === true catches this case.
      const onPause = () => {
        if (audio.ended) {
          console.log('✓ Audio ended via pause fallback (Safari iOS)');
          onEnded();
        }
      };

      const onError = () => {
        console.error('❌ Audio loading/decoding error (TTS fetch may have failed)');
        settle(false);
      };

      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('error', onError);
      };

      audio.addEventListener('ended', onEnded);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('error', onError);

      // Call play() immediately rather than waiting for the 'canplay' event.
      // This keeps the call within Chrome's user-activation window and avoids
      // the race where a cached/fast-loading response fires 'canplay' before
      // the listener is attached. The play() promise resolves once the browser
      // starts rendering frames, so isTtsFetching stays true until then.
      console.log('🎵 Calling audio.play() directly...');
      audio.play()
        .then(() => {
          console.log('✓ Audio playback started');
          settle(true);
        })
        .catch((playError) => {
          console.error('❌ audio.play() rejected:', playError.name, playError.message);
          console.error('💡 Hint: If on iOS Safari, make sure audio was unlocked during a user gesture');
          settle(false);
        });
    });
  }, []); // stable — reads audioEnabled via ref

  const initializeAudio = useCallback(async () => {
    try {
      console.log('🔊 Initializing audio context...');
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();

      // Unlock HTML5 audio for Safari iOS
      console.log('🔓 Unlocking HTML5 audio for iOS Safari...');
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAAA==';
      (silentAudio as any).playsInline = true;
      try { await silentAudio.play(); console.log('✓ HTML5 audio unlocked'); }
      catch (e) { console.log('⚠️ HTML5 audio unlock failed (may work anyway):', e); }

      setAudioContext(ctx);
      setAudioEnabled(true);
      audioEnabledRef.current = true; // Update ref immediately so playTextAsAudio sees it
      setShowAudioPrompt(false);
      safeStorage.setItem('audioEnabled', 'true');
      console.log('✓ Audio context initialized');

      if (pendingAudioText) {
        console.log('🎵 Playing pending audio text:', pendingAudioText.substring(0, 50) + '...');
        const played = await playTextAsAudio(pendingAudioText);
        // Only clear if playback succeeded — on failure playTextAsAudio already
        // restores pendingAudioText so the user can retry via the pending banner.
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

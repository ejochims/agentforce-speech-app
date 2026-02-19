import { useState, useEffect, useRef, useCallback } from 'react';

export function useTextToSpeech() {
  const [audioEnabled, setAudioEnabled] = useState<boolean>(
    () => localStorage.getItem('audioEnabled') === 'true'
  );
  const [showAudioPrompt, setShowAudioPrompt] = useState<boolean>(
    () => localStorage.getItem('audioEnabled') === null
  );
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [pendingAudioText, setPendingAudioText] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

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
    if (localStorage.getItem('audioEnabled') === 'true') {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
        console.log('✓ Audio context restored for returning user');
      } catch (error) {
        console.error('❌ Failed to restore audio context:', error);
        setAudioEnabled(false);
        localStorage.setItem('audioEnabled', 'false');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const playTextAsAudio = useCallback(async (text: string): Promise<boolean> => {
    if (!audioEnabledRef.current) {
      console.log('🔇 Audio disabled, storing as pending');
      setPendingAudioText(text);
      return false;
    }

    console.log('🎵 Playing TTS audio:', text.substring(0, 50) + '...');
    const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=allison&_t=${Date.now()}`;

    let audio: HTMLAudioElement;
    if (blessedAudioRef.current) {
      console.log('🎵 Reusing blessed audio element for Safari iOS');
      audio = blessedAudioRef.current;
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

    return new Promise((resolve) => {
      const cleanup = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('ended', onEnded);
      };

      const onCanPlay = () => {
        console.log('🎵 Audio canplay, attempting playback...');
        audio.play()
          .then(() => {
            console.log('✓ Audio playback started');
            currentPlayingAudioRef.current = audio;
            setIsAudioPlaying(true);
            resolve(true);
          })
          .catch((playError) => {
            console.error('❌ Audio play failed:', playError);
            console.error('💡 Hint: If on iOS Safari, make sure audio was unlocked during user gesture');
            setIsAudioPlaying(false);
            setPendingAudioText(text);
            cleanup();
            resolve(false);
          });
      };

      const onError = () => {
        console.error('❌ Audio loading error');
        setIsAudioPlaying(false);
        setPendingAudioText(text);
        cleanup();
        resolve(false);
      };

      const onEnded = () => {
        console.log('✓ Audio playback completed');
        currentPlayingAudioRef.current = null;
        setIsAudioPlaying(false);
        cleanup();
      };

      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('error', onError);
      audio.addEventListener('ended', onEnded);

      setTimeout(() => {
        if (audio.readyState === 0) {
          console.warn('⚠️ Audio loading timeout');
          setPendingAudioText(text);
          cleanup();
          resolve(false);
        }
      }, 5000);
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
      localStorage.setItem('audioEnabled', 'true');
      console.log('✓ Audio context initialized');

      if (pendingAudioText) {
        console.log('🎵 Playing pending audio text:', pendingAudioText.substring(0, 50) + '...');
        await playTextAsAudio(pendingAudioText);
        setPendingAudioText(null);
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize audio:', error);
      setAudioEnabled(false);
      localStorage.setItem('audioEnabled', 'false');
      return false;
    }
  }, [pendingAudioText, playTextAsAudio]);

  const disableAudio = useCallback(() => {
    console.log('🔇 Disabling audio...');
    if (audioContext) { audioContext.close(); setAudioContext(null); }
    setAudioEnabled(false);
    audioEnabledRef.current = false;
    setShowAudioPrompt(false);
    setPendingAudioText(null);
    localStorage.setItem('audioEnabled', 'false');
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
        localStorage.setItem('audioEnabled', 'true');
        setShowAudioPrompt(false);
      }
    } finally {
      isAudioUnlockingRef.current = false;
    }
  }, []);

  const stopAudio = useCallback(() => {
    const audio = currentPlayingAudioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; currentPlayingAudioRef.current = null; }
    setIsAudioPlaying(false);
  }, []);

  return {
    audioEnabled,
    showAudioPrompt,
    pendingAudioText,
    isAudioPlaying,
    initializeAudio,
    disableAudio,
    playTextAsAudio,
    stopAudio,
    unlockAudioForSafari,
    setPendingAudioText,
    setShowAudioPrompt,
  };
}

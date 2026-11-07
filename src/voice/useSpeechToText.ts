import { useCallback, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type SpeechToTextStatus = 'idle' | 'requesting_permission' | 'listening' | 'error';

export interface SpeechToTextState {
  status: SpeechToTextStatus;
  /** The live transcript — interim words while listening, settles to the final transcript on stop. */
  transcript: string;
  /** 0–1, smoothed from the native volume event; drives the waveform. 0 when not listening. */
  level: number;
  errorMessage: string | null;
}

export interface SpeechToTextControls extends SpeechToTextState {
  start: () => Promise<void>;
  stop: () => void;
  /** Lets the capture screen correct a misheard word, or clear and start over. */
  setTranscript: (text: string) => void;
  reset: () => void;
}

// expo-speech-recognition's volumechange event reports roughly -2 (silence) to 10 (loud) on iOS;
// Android's range is looser. Clamping+normalizing here keeps the waveform component platform-agnostic.
function normalizeVolume(raw: number): number {
  const clamped = Math.max(-2, Math.min(10, raw));
  return (clamped + 2) / 12;
}

export function useSpeechToText(): SpeechToTextControls {
  const [status, setStatus] = useState<SpeechToTextStatus>('idle');
  const [transcript, setTranscriptState] = useState('');
  const [level, setLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Listening is user-driven (tap to stop) rather than relying solely on the native 'end' event,
  // so a stray 'end' right after 'start' (seen on some Android OEM recognizers) can't strand the
  // UI in a dead "still listening" state.
  const stoppingRef = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    stoppingRef.current = false;
    setStatus('listening');
    setErrorMessage(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setStatus('idle');
    setLevel(0);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript;
    if (typeof text === 'string') setTranscriptState(text);
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    setLevel(normalizeVolume(event.value));
  });

  useSpeechRecognitionEvent('error', (event) => {
    stoppingRef.current = false;
    setStatus('error');
    setLevel(0);
    setErrorMessage(
      event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone or speech recognition permission was denied.'
        : event.error === 'no-speech'
          ? "Didn't catch any speech — try again."
          : event.message || 'Speech recognition failed.'
    );
  });

  const start = useCallback(async () => {
    setStatus('requesting_permission');
    setErrorMessage(null);
    const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perms.granted) {
      setStatus('error');
      setErrorMessage('Microphone or speech recognition permission was denied.');
      return;
    }
    setTranscriptState('');
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const reset = useCallback(() => {
    setTranscriptState('');
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  return { status, transcript, level, errorMessage, start, stop, setTranscript: setTranscriptState, reset };
}

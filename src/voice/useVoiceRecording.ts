import { useCallback, useRef, useState } from 'react';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { ApiError } from '../connections/types';
import { transcribeAudio } from './api';

export type VoiceRecordingStatus = 'idle' | 'requesting_permission' | 'recording' | 'transcribing' | 'error';

export interface VoiceRecordingControls {
  status: VoiceRecordingStatus;
  durationMillis: number;
  /** The reviewable transcript once transcription succeeds -- never used for anything until the caller lets the user edit/confirm it. */
  transcript: string;
  /** The local file for the just-recorded clip, so the screen can offer playback for review. Cleared by reset(). */
  recordingUri: string | null;
  errorMessage: string | null;
  start: () => Promise<void>;
  /** Stops recording, uploads for transcription, and populates `transcript`. */
  stop: () => Promise<void>;
  /** Discards an in-progress recording without transcribing it. */
  cancel: () => void;
  setTranscript: (text: string) => void;
  reset: () => void;
}

// expo-audio's HIGH_QUALITY preset always produces a .m4a container on both
// iOS and Android (LOW_QUALITY is the only preset that diverges, using
// .3gp on Android) -- matching the backend's audio/m4a allow-list exactly.
const RECORDING_MIME_TYPE = 'audio/m4a';

export function useVoiceRecording(): VoiceRecordingControls {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [status, setStatus] = useState<VoiceRecordingStatus>('idle');
  const [transcript, setTranscriptState] = useState('');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guards against a fast double-tap on "stop" racing two recorder.stop() calls.
  const stoppingRef = useRef(false);

  const start = useCallback(async () => {
    setStatus('requesting_permission');
    setErrorMessage(null);
    setTranscriptState('');
    setRecordingUri(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus('error');
        setErrorMessage('Microphone permission was denied.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStatus('recording');
    } catch (e) {
      setStatus('error');
      setErrorMessage(e instanceof Error ? e.message : 'Could not start recording.');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (stoppingRef.current || status !== 'recording') return;
    stoppingRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setStatus('error');
        setErrorMessage('Recording did not produce an audio file. Try again.');
        return;
      }
      setRecordingUri(uri);
      setStatus('transcribing');
      const result = await transcribeAudio(uri, RECORDING_MIME_TYPE);
      if (!result.transcript.trim()) {
        setStatus('error');
        setErrorMessage("Didn't catch any speech — try again.");
        return;
      }
      setTranscriptState(result.transcript);
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setErrorMessage(
        e instanceof ApiError ? e.message : 'Could not transcribe the recording. Check your connection and try again.'
      );
    } finally {
      stoppingRef.current = false;
    }
  }, [recorder, status]);

  const cancel = useCallback(() => {
    if (status === 'recording') {
      recorder.stop().catch(() => undefined);
    }
    setStatus('idle');
  }, [recorder, status]);

  const reset = useCallback(() => {
    setTranscriptState('');
    setRecordingUri(null);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  return {
    status,
    durationMillis: recorderState.durationMillis ?? 0,
    transcript,
    recordingUri,
    errorMessage,
    start,
    stop,
    cancel,
    setTranscript: setTranscriptState,
    reset,
  };
}

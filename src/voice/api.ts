import { File, UploadType } from 'expo-file-system';
import { ensureSessionToken, getBackendBaseUrl } from '../connections/api';
import { ApiError, type ApiErrorBody } from '../connections/types';
import { storeSessionToken } from '../connections/session';

export interface TranscriptionResult {
  /** The raw, unreviewed transcript -- callers must show this for the user
   * to edit/confirm before using it for anything else (see daily briefing). */
  transcript: string;
}

function safeParseError(body: string): ApiErrorBody | null {
  try {
    return JSON.parse(body) as ApiErrorBody;
  } catch {
    return null;
  }
}

/**
 * Uploads a recorded audio file to the backend for transcription. The file
 * never leaves local storage except as this one upload -- the backend
 * processes it in memory and discards it once transcribed.
 *
 * Deliberately NOT routed through apiFetch/global fetch: Expo SDK 57's
 * default `fetch` implementation only accepts a real Blob/File FormData
 * part, not React Native's classic `{ uri, type, name }` file reference
 * (confirmed on-device -- that shape throws "Unsupported FormDataPart
 * implementation", and wrapping the file's bytes in `new Blob([...])`
 * isn't supported either: "Creating blobs from 'ArrayBuffer' ... are not
 * supported"). expo-file-system's File.upload() with
 * UploadType.MULTIPART talks to the native upload session directly and
 * sidesteps both limitations.
 */
export async function transcribeAudio(fileUri: string, mimeType: string, isRetry = false): Promise<TranscriptionResult> {
  const token = await ensureSessionToken();
  const file = new File(fileUri);
  const url = new URL('/api/ai/voice/transcribe', getBackendBaseUrl()).toString();

  const result = await file.upload(url, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'audio',
    mimeType,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (result.status === 401 && !isRetry) {
    await storeSessionToken('');
    return transcribeAudio(fileUri, mimeType, true);
  }
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(result.status, safeParseError(result.body));
  }
  return JSON.parse(result.body) as TranscriptionResult;
}

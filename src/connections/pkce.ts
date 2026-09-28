import * as Crypto from 'expo-crypto';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-encodes raw bytes without relying on a global btoa/Buffer, since
 * neither is guaranteed to exist in the Hermes RN runtime. */
export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      BASE64_CHARS[(chunk >> 18) & 63] +
      BASE64_CHARS[(chunk >> 12) & 63] +
      BASE64_CHARS[(chunk >> 6) & 63] +
      BASE64_CHARS[chunk & 63];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i] << 16;
    result += BASE64_CHARS[(chunk >> 18) & 63] + BASE64_CHARS[(chunk >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result +=
      BASE64_CHARS[(chunk >> 18) & 63] + BASE64_CHARS[(chunk >> 12) & 63] + BASE64_CHARS[(chunk >> 6) & 63] + '=';
  }
  return result;
}

/** RFC 7636 base64url: '+'->'-', '/'->'_', no padding. */
export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random 43-128 char PKCE code_verifier (RFC 7636 ​§4.1). */
export async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(64);
  return toBase64Url(bytesToBase64(bytes)).slice(0, 128);
}

/** code_challenge = BASE64URL(SHA256(ASCII(code_verifier))), per RFC 7636 §4.2. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digestBase64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return toBase64Url(digestBase64);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  return { verifier, challenge };
}

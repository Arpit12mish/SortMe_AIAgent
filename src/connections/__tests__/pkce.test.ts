import { bytesToBase64, toBase64Url } from '../pkce';

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('bytesToBase64', () => {
  // RFC 4648 §10 test vectors.
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %j as %j', (input, expected) => {
    expect(bytesToBase64(bytes(input))).toBe(expected);
  });
});

describe('toBase64Url', () => {
  it('replaces + with - and / with _', () => {
    expect(toBase64Url('a+b/c')).toBe('a-b_c');
  });

  it('strips trailing padding', () => {
    expect(toBase64Url('Zg==')).toBe('Zg');
    expect(toBase64Url('Zm8=')).toBe('Zm8');
    expect(toBase64Url('Zm9v')).toBe('Zm9v');
  });

  it('produces a value containing only PKCE-safe characters', () => {
    const result = toBase64Url('++--//__==');
    expect(result).toMatch(/^[A-Za-z0-9\-_]*$/);
  });
});

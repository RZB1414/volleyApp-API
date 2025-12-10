const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

export async function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerSegment = toBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadSegment = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureSegment = toBase64Url(new Uint8Array(signature));
  return `${signingInput}.${signatureSegment}`;
}

export async function verifyJwt<T = Record<string, unknown>>(token: string, secret: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const key = await importKey(secret);
  const signatureBytes = fromBase64Url(signatureSegment);
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(signingInput)
  );

  if (!isValid) {
    throw new Error('Invalid token');
  }

  const payloadJson = decoder.decode(fromBase64Url(payloadSegment));
  const payload = JSON.parse(payloadJson) as T;

  if (payload && typeof payload === 'object' && 'exp' in payload) {
    const exp = Number(payload.exp);
    if (!Number.isNaN(exp) && exp * 1000 < Date.now()) {
      throw new Error('Token expired');
    }
  }

  return payload;
}

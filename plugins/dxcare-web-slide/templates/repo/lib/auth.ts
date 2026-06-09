import { SignJWT, jwtVerify } from 'jose';

const ALG = 'HS256';
const TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

function keyFromSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  return await new SignJWT({ sub: payload.sub })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(keyFromSecret(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, keyFromSecret(secret), { algorithms: [ALG] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'dxcare_slides_session';
export const SESSION_MAX_AGE = TTL_SECONDS;

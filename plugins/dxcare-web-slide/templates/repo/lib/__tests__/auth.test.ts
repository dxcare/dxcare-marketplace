import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../auth.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

describe('session cookie', () => {
  it('signs and verifies a valid token', async () => {
    const token = await signSession({ sub: 'noel' }, SECRET);
    const payload = await verifySession(token, SECRET);
    expect(payload?.sub).toBe('noel');
  });

  it('returns null for an invalid token', async () => {
    const payload = await verifySession('not-a-token', SECRET);
    expect(payload).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signSession({ sub: 'noel' }, SECRET);
    const other = await verifySession(token, 'different-secret-also-long-enough-32chars');
    expect(other).toBeNull();
  });
});

import { NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));

  const expected = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SECRET;

  if (!expected || !secret) {
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
  }

  if (typeof password !== 'string' || password !== expected) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const token = await signSession({ sub: 'noel' }, secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

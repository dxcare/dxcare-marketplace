'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rawRedirect = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('redirect') || '/'
    : '/';
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      window.location.href = redirect;
    } else {
      setError('비밀번호가 맞지 않습니다.');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper">
      <form onSubmit={submit} className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-lg space-y-4">
        <h1 className="text-2xl font-semibold text-ink">DXCare Slides</h1>
        <p className="text-sm text-muted">대시보드에 접근하려면 비밀번호가 필요합니다.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full px-4 py-3 border border-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          autoFocus
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="w-full py-3 bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90 transition"
        >
          {loading ? '확인 중…' : '접속'}
        </button>
      </form>
    </main>
  );
}

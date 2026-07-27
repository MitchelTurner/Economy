import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setTokens } from '../lib/api';

export function InviteAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ user: { email: string } }>('/household/invites/accept', {
        method: 'POST',
        json: { token, password, displayName: displayName || undefined },
        auth: false,
      });
      // Log in with the new credentials
      const login = await api<{ accessToken: string; refreshToken: string }>(
        '/auth/login',
        {
          method: 'POST',
          json: { email: res.user.email, password },
          auth: false,
        },
      );
      setTokens(login);
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Invite failed');
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center">
      <p className="brand text-4xl font-bold text-[var(--brand)]">Island Ledger</p>
      <h1 className="mt-3 text-2xl font-semibold">Join household</h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 max-w-md space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        {!token && (
          <p className="text-sm text-[var(--danger)]">Missing invite token in URL.</p>
        )}
        <label className="block text-sm">
          Display name
          <input
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="submit"
          disabled={!token}
          className="w-full rounded-md bg-[var(--brand)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          Accept invite
        </button>
      </form>
      <Link to="/login" className="mt-4 text-sm font-semibold text-[var(--brand-soft)]">
        Back to sign in
      </Link>
    </div>
  );
}

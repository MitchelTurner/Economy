import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiErrorMessage } from '../lib/api';

export function LoginPage() {
  const { user, login, register, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@islandledger.local');
  const [password, setPassword] = useState('demo-password-123');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, password, displayName: displayName || undefined });
    } catch (err) {
      setError(apiErrorMessage(err, mode === 'login' ? 'Sign in failed' : 'Could not create account'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <p className="brand text-5xl font-bold text-[var(--brand)]">Island Ledger</p>
        <p className="mt-3 max-w-sm text-[var(--ink-muted)]">
          Photograph a receipt. Track island prices. Know where the money goes.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur"
        >
          <div className="flex gap-2 text-sm font-semibold" role="group" aria-label="Auth mode">
            <button
              type="button"
              aria-pressed={mode === 'login'}
              className={mode === 'login' ? 'text-[var(--brand)]' : 'text-[var(--ink-muted)]'}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
            <span className="text-[var(--ink-muted)]">·</span>
            <button
              type="button"
              aria-pressed={mode === 'register'}
              className={mode === 'register' ? 'text-[var(--brand)]' : 'text-[var(--ink-muted)]'}
              onClick={() => setMode('register')}
            >
              Create household
            </button>
          </div>

          {mode === 'register' && (
            <label className="block text-sm">
              Display name
              <input
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          )}

          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {mode === 'register' ? (
              <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                At least 8 characters
              </span>
            ) : (
              <span className="mt-1 block text-right text-xs">
                <Link to="/forgot-password" className="font-semibold text-[var(--brand-soft)]">
                  Forgot password?
                </Link>
              </span>
            )}
          </label>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[var(--brand)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--ink-muted)]">
          Curious about island prices?{' '}
          <a href="/island" className="font-semibold text-[var(--brand-soft)]">
            View the public cost-of-goods index
          </a>
        </p>
      </div>
    </div>
  );
}

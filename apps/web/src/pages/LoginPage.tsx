import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api, apiErrorMessage } from '../lib/api';

const LOCAL_EMAIL_KEY = 'island.savedEmail';

export function LoginPage() {
  const { user, login, demoLogin, register, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberNetwork, setRememberNetwork] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    void api<{ enabled: boolean }>('/auth/demo', { auth: false })
      .then((s) => setDemoEnabled(s.enabled))
      .catch(() => setDemoEnabled(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Local device fallback, then server IP-keyed email for this network.
      const local = localStorage.getItem(LOCAL_EMAIL_KEY)?.trim() ?? '';
      if (local && !cancelled) {
        setEmail(local);
        setRememberNetwork(true);
        setSavedHint(true);
      }
      try {
        const saved = await api<{ email: string | null }>('/auth/saved-login', {
          auth: false,
        });
        if (cancelled) return;
        if (saved.email) {
          setEmail(saved.email);
          setRememberNetwork(true);
          setSavedHint(true);
          localStorage.setItem(LOCAL_EMAIL_KEY, saved.email);
        }
      } catch (err) {
        // 404 while API deploy lags, or Redis blip — never block login.
        const status = (err as { status?: number })?.status;
        if (status && status !== 404) {
          console.warn('saved-login prefills unavailable', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password, { rememberNetwork });
      } else {
        await register({
          email,
          password,
          displayName: displayName || undefined,
          rememberNetwork,
        });
      }
      if (rememberNetwork) {
        localStorage.setItem(LOCAL_EMAIL_KEY, email.trim().toLowerCase());
      } else {
        localStorage.removeItem(LOCAL_EMAIL_KEY);
        try {
          await api('/auth/saved-login', { method: 'DELETE', auth: false });
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(apiErrorMessage(err, mode === 'login' ? 'Sign in failed' : 'Could not create account'));
    } finally {
      setBusy(false);
    }
  }

  async function onDemo() {
    setBusy(true);
    setError(null);
    try {
      await demoLogin();
    } catch (err) {
      setError(apiErrorMessage(err, 'Demo login unavailable'));
    } finally {
      setBusy(false);
    }
  }

  async function forgetNetwork() {
    localStorage.removeItem(LOCAL_EMAIL_KEY);
    setSavedHint(false);
    setEmail('');
    try {
      await api('/auth/saved-login', { method: 'DELETE', auth: false });
    } catch {
      // ignore
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <p className="brand text-5xl font-bold text-[var(--brand)]">Island Ledger</p>
        <p className="mt-3 max-w-sm text-[var(--ink-muted)]">
          Photograph a receipt. Track island prices. Know where the money goes.
        </p>

        {demoEnabled && (
          <div className="mt-8 space-y-2 rounded-2xl border border-[var(--brand-soft)]/40 bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--ink-muted)]">
              Jump in with a ready-made household — no password typing.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDemo()}
              className="w-full rounded-md border border-[var(--brand-soft)] bg-white/70 px-4 py-2.5 font-semibold text-[var(--brand)] disabled:opacity-60"
            >
              {busy ? 'Starting demo…' : 'Continue with demo account'}
            </button>
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="mt-4 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur"
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
              autoComplete="username"
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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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

          <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={rememberNetwork}
              onChange={(e) => setRememberNetwork(e.target.checked)}
            />
            <span>
              Remember email on this network
              <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                Saves your email for this IP so the next visit can prefill it. Password is never
                stored.
              </span>
            </span>
          </label>

          {savedHint && (
            <p className="text-xs text-[var(--ink-muted)]">
              Email remembered for this network.{' '}
              <button
                type="button"
                className="font-semibold text-[var(--brand-soft)]"
                onClick={() => void forgetNetwork()}
              >
                Forget
              </button>
            </p>
          )}

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

import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        json: { email },
        auth: false,
      });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send reset email'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <p className="brand text-5xl font-bold text-[var(--brand)]">Island Ledger</p>
        <h1 className="mt-3 text-2xl font-semibold">Forgot password</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Enter your account email and we&apos;ll send a one-hour reset link.
        </p>

        {done ? (
          <div className="mt-8 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--ink)]">
              If an account exists for that email, a reset link is on its way. Check your inbox
              (and spam). Without outbound email configured, the link is also written to the API
              server logs.
            </p>
            <Link to="/login" className="inline-block font-semibold text-[var(--brand)]">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur"
          >
            <label className="block text-sm">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-[var(--brand)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-center text-sm">
              <Link to="/login" className="font-semibold text-[var(--brand-soft)]">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

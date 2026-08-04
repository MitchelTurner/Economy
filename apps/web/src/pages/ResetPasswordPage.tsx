import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('This reset link is missing a token. Request a new one from the sign-in page.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        json: { token, newPassword: password },
        auth: false,
      });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not reset password'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <p className="brand text-5xl font-bold text-[var(--brand)]">Island Ledger</p>
        <h1 className="mt-3 text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          After saving, sign in with your new password. Other sessions will be signed out.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur"
        >
          {!token && (
            <p className="text-sm text-[var(--danger)]">
              Missing reset token.{' '}
              <Link to="/forgot-password" className="font-semibold underline">
                Request a new link
              </Link>
              .
            </p>
          )}
          <label className="block text-sm">
            New password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="mt-1 block text-xs text-[var(--ink-muted)]">At least 8 characters</span>
          </label>
          <label className="block text-sm">
            Confirm password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full rounded-md bg-[var(--brand)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save new password'}
          </button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-semibold text-[var(--brand-soft)]">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

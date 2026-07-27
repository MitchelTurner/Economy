import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setTokens } from '../lib/api';

type Peek = {
  email: string;
  expiresAt: string;
  household: { id: string; name: string };
};

export function InviteAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [peek, setPeek] = useState<Peek | null>(null);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [moveHousehold, setMoveHousehold] = useState(false);
  const [needsMoveConfirm, setNeedsMoveConfirm] = useState(false);
  const [currentHouseholdName, setCurrentHouseholdName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    void api<Peek>(`/household/invites/peek?token=${encodeURIComponent(token)}`, {
      auth: false,
    })
      .then(setPeek)
      .catch((err) => setError((err as Error).message || 'Invite invalid'));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ user: { email: string } }>('/household/invites/accept', {
        method: 'POST',
        json: {
          token,
          password,
          displayName: displayName || undefined,
          moveHousehold,
        },
        auth: false,
      });
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
      const body = (err as { detail?: { message?: unknown; code?: string } }).detail;
      const nested =
        body && typeof body.message === 'object' && body.message !== null
          ? (body.message as Record<string, unknown>)
          : null;
      const code =
        (typeof nested?.code === 'string' ? nested.code : undefined) ?? body?.code;
      if (code === 'ALREADY_IN_HOUSEHOLD') {
        setNeedsMoveConfirm(true);
        setCurrentHouseholdName(
          typeof nested?.currentHouseholdName === 'string'
            ? nested.currentHouseholdName
            : null,
        );
        setError(
          (typeof nested?.message === 'string' ? nested.message : undefined) ??
            'You already belong to another household. Check the box to confirm moving.',
        );
        return;
      }
      const fallback =
        (typeof body?.message === 'string' ? body.message : undefined) ??
        (err as Error).message;
      setError(fallback || 'Invite failed');
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center">
      <p className="brand text-4xl font-bold text-[var(--brand)]">Island Ledger</p>
      <h1 className="mt-3 text-2xl font-semibold">Join household</h1>
      {peek && (
        <p className="mt-2 text-[var(--ink-muted)]">
          Invited as <span className="font-semibold text-[var(--ink)]">{peek.email}</span> to{' '}
          <span className="font-semibold text-[var(--ink)]">{peek.household.name}</span>
        </p>
      )}
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
        {needsMoveConfirm && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={moveHousehold}
              onChange={(e) => setMoveHousehold(e.target.checked)}
            />
            <span>
              Leave {currentHouseholdName ?? 'my current household'} and join{' '}
              {peek?.household.name ?? 'this household'}
            </span>
          </label>
        )}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="submit"
          disabled={!token || (needsMoveConfirm && !moveHousehold)}
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

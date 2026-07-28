import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api, apiErrorMessage, setTokens } from '../lib/api';
import { toast } from '../lib/toast';

type Household = {
  id: string;
  name: string;
  users: Array<{ id: string; email: string; displayName: string | null; role: string }>;
  invites: Array<{ id: string; email: string; expiresAt: string; inviteUrl: string }>;
};

type Usage = {
  maxExtractionsPerDay: number;
  extractionsToday: number;
  remainingToday: number;
  week: { extractions: number; inputTokens: number; outputTokens: number };
};

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [emailDigest, setEmailDigest] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [exportBusy, setExportBusy] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);

  async function load() {
    const [hh, u] = await Promise.all([
      api<Household>('/household'),
      api<Usage>('/household/usage'),
    ]);
    setHousehold(hh);
    setHouseholdName(hh.name);
    setUsage(u);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setEmailDigest(user?.emailDigest !== false);
    setEmailAlerts(user?.emailAlerts !== false);
    setDisplayName(user?.displayName ?? '');
  }, [user]);

  async function saveEmailPrefs(next: { emailDigest?: boolean; emailAlerts?: boolean }) {
    try {
      await api('/auth/me', { method: 'PATCH', json: next });
      await refreshUser();
      toast('Email preferences saved', 'ok');
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not save email preferences'), 'danger');
    }
  }

  async function copyInviteLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Invite link copied', 'ok');
    } catch {
      setInviteLink(url);
      toast('Copy failed — link shown below', 'danger');
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    try {
      const inv = await api<{ inviteUrl: string }>('/household/invites', {
        method: 'POST',
        json: { email },
      });
      setInviteLink(inv.inviteUrl);
      setMessage('Invite email queued (or logged in API if no RESEND_API_KEY).');
      toast('Invite created', 'ok');
      await copyInviteLink(inv.inviteUrl);
      setEmail('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Invite failed'), 'danger');
    }
  }

  async function exportData() {
    setExportBusy(true);
    try {
      const data = await api<{ json: unknown; csv: string }>('/household/export');
      const blob = new Blob([JSON.stringify(data.json, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'island-ledger-export.json';
      a.click();
      URL.revokeObjectURL(url);

      const csvBlob = new Blob([data.csv], { type: 'text/csv' });
      const csvUrl = URL.createObjectURL(csvBlob);
      const a2 = document.createElement('a');
      a2.href = csvUrl;
      a2.download = 'island-ledger-lines.csv';
      a2.click();
      URL.revokeObjectURL(csvUrl);
      setMessage('Export downloaded (JSON + CSV).');
      toast('Export downloaded', 'ok');
    } catch (err) {
      toast(apiErrorMessage(err, 'Export failed'), 'danger');
    } finally {
      setExportBusy(false);
    }
  }

  async function hardDelete() {
    if (deleteConfirm !== 'DELETE') {
      setMessage('Type DELETE in the confirm box to wipe this household.');
      return;
    }
    if (
      !confirm(
        'Permanently delete this household, all receipts, images, price history, and members? This cannot be undone.',
      )
    ) {
      return;
    }
    setWipeBusy(true);
    try {
      await api('/household', { method: 'DELETE' });
      toast('Household deleted', 'ok');
      await logout();
    } catch (err) {
      toast(apiErrorMessage(err, 'Delete failed'), 'danger');
    } finally {
      setWipeBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Household sharing, export, and hard delete.
        </p>
      </div>

      <section className="space-y-3">
        <p className="text-sm text-[var(--ink-muted)]">Signed in as</p>
        <p className="font-semibold">{user?.email}</p>
        <p className="text-sm text-[var(--ink-muted)]">
          Role: {user?.role ?? 'member'}
          {household ? ` · ${household.users.length} members` : ''}
        </p>
        <label className="block text-sm">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full max-w-md rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={nameBusy}
          aria-busy={nameBusy}
          onClick={() => {
            setNameBusy(true);
            void api('/auth/me', {
              method: 'PATCH',
              json: { displayName: displayName.trim() || undefined },
            })
              .then(() => refreshUser())
              .then(() => toast('Display name saved', 'ok'))
              .catch((err) => toast(apiErrorMessage(err, 'Could not save name'), 'danger'))
              .finally(() => setNameBusy(false));
          }}
        >
          Save name
        </button>
        <label className="block text-sm">
          Household name
          <input
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            disabled={user?.role !== 'owner'}
            className="mt-1 w-full max-w-md rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 disabled:opacity-60"
          />
        </label>
        {user?.role === 'owner' ? (
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-semibold"
            onClick={() => {
              const name = householdName.trim();
              if (!name) {
                toast('Enter a household name', 'danger');
                return;
              }
              void api('/household', { method: 'PATCH', json: { name } })
                .then(() => refreshUser())
                .then(() => load())
                .then(() => toast('Household renamed', 'ok'))
                .catch((err) =>
                  toast(apiErrorMessage(err, 'Could not rename household'), 'danger'),
                );
            }}
          >
            Save household name
          </button>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">Only the owner can rename the household.</p>
        )}
      </section>

      <section className="space-y-3" aria-label="Change password">
        <h2 className="text-xl font-semibold">Change password</h2>
        <label className="block text-sm">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full max-w-md rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full max-w-md rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-[var(--ink-muted)]">
            At least 8 characters. Other sessions will be signed out.
          </span>
        </label>
        <button
          type="button"
          className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={passwordBusy}
          aria-busy={passwordBusy}
          onClick={() => {
            if (newPassword.length < 8) {
              toast('New password must be at least 8 characters', 'danger');
              return;
            }
            setPasswordBusy(true);
            void api('/auth/change-password', {
              method: 'POST',
              json: { currentPassword, newPassword },
            })
              .then(async () => {
                setCurrentPassword('');
                setNewPassword('');
                toast('Password updated — sign in again', 'ok');
                await logout();
              })
              .catch((err) =>
                toast(apiErrorMessage(err, 'Password change failed'), 'danger'),
              )
              .finally(() => setPasswordBusy(false));
          }}
        >
          Update password
        </button>
      </section>

      {usage && (
        <section className="space-y-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <h2 className="text-lg font-semibold">Extraction usage</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Today: {usage.extractionsToday} / {usage.maxExtractionsPerDay} (
            {usage.remainingToday} left)
          </p>
          <p className="text-sm text-[var(--ink-muted)]">
            Last 7 days: {usage.week.extractions} runs ·{' '}
            {usage.week.inputTokens + usage.week.outputTokens} tokens
          </p>
        </section>
      )}

      <section className="space-y-3" aria-label="Email notifications">
        <h2 className="text-xl font-semibold">Email notifications</h2>
        <p className="text-sm text-[var(--ink-muted)]">
          Weekly digests and price-drop emails respect these toggles. In-app Insights still
          update either way.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={emailDigest}
            onChange={(e) => {
              const v = e.target.checked;
              setEmailDigest(v);
              void saveEmailPrefs({ emailDigest: v });
            }}
          />
          Weekly insight digest email
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => {
              const v = e.target.checked;
              setEmailAlerts(v);
              void saveEmailPrefs({ emailAlerts: v });
            }}
          />
          Price-drop alert emails
        </label>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Members</h2>
        <ul className="mt-2 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {household?.users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {u.displayName ?? u.email}
                <span className="text-[var(--ink-muted)]"> · {u.email}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-[var(--ink-muted)]">{u.role}</span>
                {user?.role === 'owner' && u.id !== user?.id && u.role !== 'owner' ? (
                  <button
                    type="button"
                    className="font-semibold text-[var(--brand-soft)]"
                    onClick={() => {
                      if (
                        !confirm(
                          `Make ${u.email} the household owner? You will become a member.`,
                        )
                      ) {
                        return;
                      }
                      void api('/household/transfer', {
                        method: 'POST',
                        json: { userId: u.id },
                      })
                        .then(async () => {
                          toast('Ownership transferred', 'ok');
                          await refreshUser();
                          await load();
                        })
                        .catch((err) =>
                          toast(
                            apiErrorMessage(err, 'Could not transfer ownership'),
                            'danger',
                          ),
                        );
                    }}
                  >
                    Make owner
                  </button>
                ) : null}
                {user?.role === 'owner' && u.id !== user?.id ? (
                  <button
                    type="button"
                    className="font-semibold text-[var(--danger)]"
                    onClick={() => {
                      if (!confirm(`Remove ${u.email} from this household?`)) return;
                      void api(`/household/members/${u.id}`, { method: 'DELETE' })
                        .then(() => {
                          toast('Member removed', 'ok');
                          return load();
                        })
                        .catch((err) =>
                          toast(apiErrorMessage(err, 'Could not remove member'), 'danger'),
                        );
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {household && household.users.length > 1 ? (
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-[var(--brand-soft)]"
            onClick={() => {
              if (
                !confirm(
                  'Leave this household and start your own empty one? Your receipts stay with the household.',
                )
              ) {
                return;
              }
              void api<{
                accessToken: string;
                refreshToken: string;
              }>('/household/leave', { method: 'POST' })
                .then(async (res) => {
                  setTokens({
                    accessToken: res.accessToken,
                    refreshToken: res.refreshToken,
                  });
                  toast('Left household', 'ok');
                  await refreshUser();
                  await load();
                })
                .catch((err) =>
                  toast(apiErrorMessage(err, 'Could not leave household'), 'danger'),
                );
            }}
          >
            Leave household
          </button>
        ) : null}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Invite</h2>
        <form onSubmit={invite} className="mt-2 flex gap-2">
          <input
            type="email"
            required
            placeholder="member@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white"
          >
            Invite
          </button>
        </form>
        {inviteLink && (
          <p className="mt-2 break-all text-sm text-[var(--brand)]">
            Share this link: {inviteLink}{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void copyInviteLink(inviteLink)}
            >
              Copy
            </button>
          </p>
        )}
        {household && household.invites.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {household.invites.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 text-[var(--ink-muted)]"
              >
                <span>
                  Pending {i.email} · expires {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="font-semibold text-[var(--brand-soft)]"
                    onClick={() => void copyInviteLink(i.inviteUrl)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className="font-semibold text-[var(--danger)]"
                    onClick={() =>
                      void api(`/household/invites/${i.id}`, { method: 'DELETE' })
                        .then(() => {
                          toast('Invite revoked', 'ok');
                          return load();
                        })
                        .catch((err) =>
                          toast(apiErrorMessage(err, 'Revoke failed'), 'danger'),
                        )
                    }
                  >
                    Revoke
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ul className="space-y-2 text-[var(--brand-soft)]">
        <li>
          <Link to="/prices" className="font-semibold">
            Price search
          </Link>
        </li>
        <li>
          <Link to="/alerts" className="font-semibold">
            Price-drop alerts
          </Link>
        </li>
        <li>
          <Link to="/delivered" className="font-semibold">
            Mainland delivered cost
          </Link>
        </li>
        <li>
          <Link to="/budgets" className="font-semibold">
            Budgets
          </Link>
        </li>
        <li>
          <Link to="/island" className="font-semibold">
            Public island index
          </Link>
        </li>
      </ul>

      <div className="space-y-2">
        <label className="block text-sm text-[var(--danger)]">
          Type DELETE to enable household wipe
          <input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-md border border-[var(--danger)] bg-white/80 px-3 py-2"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportData()}
            disabled={exportBusy}
            aria-busy={exportBusy}
            className="rounded-md border border-[var(--line)] px-4 py-2 font-semibold disabled:opacity-50"
          >
            Export JSON + CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => toast('Signed out', 'ok'));
            }}
            className="rounded-md border border-[var(--line)] px-4 py-2 font-semibold"
          >
            Sign out
          </button>
          <button
            type="button"
            disabled={logoutAllBusy}
            aria-busy={logoutAllBusy}
            onClick={() => {
              if (
                !confirm(
                  'Sign out every device and browser session for this account?',
                )
              ) {
                return;
              }
              setLogoutAllBusy(true);
              void api('/auth/logout-all', { method: 'POST' })
                .then(async () => {
                  toast('Signed out everywhere', 'ok');
                  await logout();
                })
                .catch((err) =>
                  toast(apiErrorMessage(err, 'Could not sign out everywhere'), 'danger'),
                )
                .finally(() => setLogoutAllBusy(false));
            }}
            className="rounded-md border border-[var(--line)] px-4 py-2 font-semibold disabled:opacity-50"
          >
            Sign out everywhere
          </button>
          {user?.role === 'owner' ? (
            <button
              type="button"
              disabled={deleteConfirm !== 'DELETE' || wipeBusy}
              aria-busy={wipeBusy}
              onClick={() => void hardDelete()}
              className="rounded-md border border-[var(--danger)] px-4 py-2 font-semibold text-[var(--danger)] disabled:opacity-40"
            >
              Delete household data
            </button>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">
              Only the owner can wipe household data.
            </p>
          )}
        </div>
      </div>

      {message && <p className="text-sm text-[var(--ok)]">{message}</p>}
    </div>
  );
}

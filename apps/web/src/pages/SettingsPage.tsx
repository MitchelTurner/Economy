import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { toast } from '../lib/toast';

type Household = {
  id: string;
  name: string;
  users: Array<{ id: string; email: string; displayName: string | null; role: string }>;
  invites: Array<{ id: string; email: string; expiresAt: string }>;
};

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  async function load() {
    setHousehold(await api<Household>('/household'));
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const inv = await api<{ token: string; inviteUrl?: string }>(
      '/household/invites',
      {
        method: 'POST',
        json: { email },
      },
    );
    setInviteLink(
      inv.inviteUrl ?? `${window.location.origin}/invite?token=${inv.token}`,
    );
    setMessage('Invite email queued (or logged in API if no RESEND_API_KEY).');
    setEmail('');
    await load();
  }

  async function exportData() {
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
    await api('/household', { method: 'DELETE' });
    logout();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Household sharing, export, and hard delete.
        </p>
      </div>

      <section className="space-y-2">
        <p className="text-sm text-[var(--ink-muted)]">Signed in as</p>
        <p className="font-semibold">{user?.displayName ?? user?.email}</p>
        <p className="text-sm text-[var(--ink-muted)]">
          Household: {user?.household.name}
          {household ? ` · ${household.users.length} members` : ''}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Members</h2>
        <ul className="mt-2 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {household?.users.map((u) => (
            <li key={u.id} className="flex justify-between py-2 text-sm">
              <span>
                {u.displayName ?? u.email}
                <span className="text-[var(--ink-muted)]"> · {u.email}</span>
              </span>
              <span className="text-[var(--ink-muted)]">{u.role}</span>
            </li>
          ))}
        </ul>
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
            Share this link: {inviteLink}
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
                <button
                  type="button"
                  className="font-semibold text-[var(--danger)]"
                  onClick={() =>
                    void api(`/household/invites/${i.id}`, { method: 'DELETE' }).then(load)
                  }
                >
                  Revoke
                </button>
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
            className="rounded-md border border-[var(--line)] px-4 py-2 font-semibold"
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
            disabled={deleteConfirm !== 'DELETE'}
            onClick={() => void hardDelete()}
            className="rounded-md border border-[var(--danger)] px-4 py-2 font-semibold text-[var(--danger)] disabled:opacity-40"
          >
            Delete household data
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-[var(--ok)]">{message}</p>}
    </div>
  );
}

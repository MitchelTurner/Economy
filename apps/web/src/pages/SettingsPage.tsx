import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-[var(--ink-muted)]">Household, export, and data deletion.</p>
      </div>

      <section className="space-y-2">
        <p className="text-sm text-[var(--ink-muted)]">Signed in as</p>
        <p className="font-semibold">{user?.displayName ?? user?.email}</p>
        <p className="text-sm text-[var(--ink-muted)]">
          Household: {user?.household.name}
        </p>
      </section>

      <ul className="space-y-2 text-[var(--brand-soft)]">
        <li>
          <Link to="/prices" className="font-semibold">
            Price search
          </Link>
        </li>
        <li>
          <Link to="/budgets" className="font-semibold">
            Budgets
          </Link>
        </li>
      </ul>

      <button
        type="button"
        onClick={logout}
        className="rounded-md border border-[var(--line)] px-4 py-2 font-semibold"
      >
        Sign out
      </button>
    </div>
  );
}

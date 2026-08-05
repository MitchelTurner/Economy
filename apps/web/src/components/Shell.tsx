import { NavLink, Outlet } from 'react-router-dom';
import { OutboxSync } from './OutboxSync';

const mobileLinks: Array<{
  to: string;
  label: string;
  end?: boolean;
  primary?: boolean;
}> = [
  { to: '/', label: 'Home', end: true },
  { to: '/receipts', label: 'Receipts' },
  { to: '/capture', label: 'Capture', primary: true },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'More' },
];

const desktopPrimary: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Home', end: true },
  { to: '/capture', label: 'Capture' },
  { to: '/receipts', label: 'Receipts' },
  { to: '/insights', label: 'Insights' },
];

const desktopSecondary: Array<{ to: string; label: string }> = [
  { to: '/prices', label: 'Prices' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/delivered', label: 'Delivered cost' },
];

function navClass({
  isActive,
  primary = false,
}: {
  isActive: boolean;
  primary?: boolean;
}) {
  if (primary) {
    return 'flex min-h-14 min-w-[64px] flex-col items-center justify-center rounded-md bg-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-white shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]';
  }
  return [
    'flex min-h-11 min-w-[64px] flex-col items-center justify-center rounded-md px-3 py-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]',
    isActive ? 'text-[var(--brand)]' : 'text-[var(--ink-muted)]',
  ].join(' ');
}

function desktopLinkClass({ isActive }: { isActive: boolean }) {
  return [
    'block rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]',
    isActive
      ? 'bg-[var(--brand)] text-white'
      : 'text-[var(--ink-muted)] hover:bg-white/50 hover:text-[var(--ink)]',
  ].join(' ');
}

export function Shell() {
  return (
    <div className="app-frame">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="app-sidebar" aria-label="Desktop navigation">
        <div className="app-sidebar__brand">
          <p className="brand text-3xl font-bold text-[var(--brand)]">Island Ledger</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Receipts → prices → island cost of goods
          </p>
        </div>

        <NavLink
          to="/capture"
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        >
          Scan receipt
        </NavLink>

        <nav className="mt-6 flex flex-1 flex-col gap-6" aria-label="Primary">
          <ul className="space-y-1">
            {desktopPrimary.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} end={l.end} className={desktopLinkClass}>
                  {({ isActive }) => (
                    <>
                      {l.label}
                      {isActive && <span className="sr-only"> (current)</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <div>
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Analyze
            </p>
            <ul className="mt-1 space-y-1">
              {desktopSecondary.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className={desktopLinkClass}>
                    {({ isActive }) => (
                      <>
                        {l.label}
                        {isActive && <span className="sr-only"> (current)</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-auto border-t border-[var(--line)] pt-4">
            <NavLink to="/settings" className={desktopLinkClass}>
              {({ isActive }) => (
                <>
                  Settings
                  {isActive && <span className="sr-only"> (current)</span>}
                </>
              )}
            </NavLink>
          </div>
        </nav>
      </aside>

      <div className="app-content">
        <header className="app-mobile-header">
          <div>
            <p className="brand text-3xl font-bold text-[var(--brand)]">Island Ledger</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Receipts → prices → island cost of goods
            </p>
          </div>
        </header>

        <OutboxSync />

        <main id="main" className="app-main">
          <Outlet />
        </main>
      </div>

      <nav className="app-mobile-nav" aria-label="Primary">
        <ul className="app-mobile-nav__list">
          {mobileLinks.map((l) => (
            <li key={l.to} className={l.primary ? 'relative -mt-5' : ''}>
              <NavLink
                to={l.to}
                end={l.end}
                aria-label={l.label}
                className={({ isActive }) =>
                  navClass({ isActive, primary: Boolean(l.primary) })
                }
              >
                {({ isActive }) => (
                  <>
                    <span>{l.label}</span>
                    {isActive && <span className="sr-only">(current)</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

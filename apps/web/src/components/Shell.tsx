import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/receipts', label: 'Receipts' },
  { to: '/capture', label: 'Capture', primary: true },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'More' },
];

export function Shell() {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="flex items-end justify-between gap-4 py-5">
        <div>
          <p className="brand text-3xl font-bold text-[var(--brand)] md:text-4xl">
            Island Ledger
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Receipts → prices → island cost of goods
          </p>
        </div>
        <NavLink
          to="/capture"
          className="hidden rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] md:inline-flex"
        >
          Scan receipt
        </NavLink>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(238,244,240,0.92)] backdrop-blur md:static md:mt-10 md:border-0 md:bg-transparent md:backdrop-blur-none"
      >
        <ul className="mx-auto flex max-w-[480px] items-stretch justify-between gap-1 px-2 py-2 md:max-w-none md:justify-start md:gap-3 md:px-0">
          {links.map((l) => (
            <li key={l.to} className={l.primary ? 'relative -mt-5 md:mt-0' : ''}>
              <NavLink
                to={l.to}
                end={l.end}
                aria-label={l.label}
                className={({ isActive }) =>
                  [
                    'flex min-w-[64px] flex-col items-center rounded-md px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]',
                    l.primary
                      ? 'bg-[var(--accent)] text-white shadow-md'
                      : isActive
                        ? 'text-[var(--brand)]'
                        : 'text-[var(--ink-muted)]',
                  ].join(' ')
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

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Shell } from './components/Shell';
import { ToastHost } from './components/ToastHost';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CapturePage } from './pages/CapturePage';
import { ReceiptsPage } from './pages/ReceiptsPage';

const ReceiptReviewPage = lazy(() =>
  import('./pages/ReceiptReviewPage').then((m) => ({ default: m.ReceiptReviewPage })),
);
const PricesPage = lazy(() =>
  import('./pages/PricesPage').then((m) => ({ default: m.PricesPage })),
);
const PriceIndexPage = lazy(() =>
  import('./pages/PriceIndexPage').then((m) => ({ default: m.PriceIndexPage })),
);
const EconomyPage = lazy(() =>
  import('./pages/EconomyPage').then((m) => ({ default: m.EconomyPage })),
);
const InsightsPage = lazy(() =>
  import('./pages/InsightsPage').then((m) => ({ default: m.InsightsPage })),
);
const BudgetsPage = lazy(() =>
  import('./pages/BudgetsPage').then((m) => ({ default: m.BudgetsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const PublicIndexPage = lazy(() =>
  import('./pages/PublicIndexPage').then((m) => ({ default: m.PublicIndexPage })),
);
const AlertsPage = lazy(() =>
  import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const DeliveredCostPage = lazy(() =>
  import('./pages/DeliveredCostPage').then((m) => ({ default: m.DeliveredCostPage })),
);
const ManualEntryPage = lazy(() =>
  import('./pages/ManualEntryPage').then((m) => ({ default: m.ManualEntryPage })),
);
const InviteAcceptPage = lazy(() =>
  import('./pages/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="app-shell flex min-h-dvh items-center justify-center text-[var(--ink-muted)]">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="text-[var(--ink-muted)]">Loading…</p>}>{children}</Suspense>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <ToastHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/island"
          element={
            <Lazy>
              <PublicIndexPage />
            </Lazy>
          }
        />
        <Route
          path="/invite"
          element={
            <Lazy>
              <InviteAcceptPage />
            </Lazy>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <Lazy>
              <ForgotPasswordPage />
            </Lazy>
          }
        />
        <Route
          path="/reset-password"
          element={
            <Lazy>
              <ResetPasswordPage />
            </Lazy>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Shell />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route
            path="capture/manual"
            element={
              <Lazy>
                <ManualEntryPage />
              </Lazy>
            }
          />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route
            path="receipts/:id"
            element={
              <Lazy>
                <ReceiptReviewPage />
              </Lazy>
            }
          />
          <Route
            path="prices"
            element={
              <Lazy>
                <PricesPage />
              </Lazy>
            }
          />
          <Route
            path="prices/index"
            element={
              <Lazy>
                <PriceIndexPage />
              </Lazy>
            }
          />
          <Route
            path="economy"
            element={
              <Lazy>
                <EconomyPage />
              </Lazy>
            }
          />
          <Route
            path="insights"
            element={
              <Lazy>
                <InsightsPage />
              </Lazy>
            }
          />
          <Route
            path="budgets"
            element={
              <Lazy>
                <BudgetsPage />
              </Lazy>
            }
          />
          <Route
            path="alerts"
            element={
              <Lazy>
                <AlertsPage />
              </Lazy>
            }
          />
          <Route
            path="delivered"
            element={
              <Lazy>
                <DeliveredCostPage />
              </Lazy>
            }
          />
          <Route
            path="settings"
            element={
              <Lazy>
                <SettingsPage />
              </Lazy>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
    </ErrorBoundary>
  );
}

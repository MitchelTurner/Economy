import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CapturePage } from './pages/CapturePage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { ReceiptReviewPage } from './pages/ReceiptReviewPage';
import { PricesPage } from './pages/PricesPage';
import { PriceIndexPage } from './pages/PriceIndexPage';
import { InsightsPage } from './pages/InsightsPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicIndexPage } from './pages/PublicIndexPage';
import { AlertsPage } from './pages/AlertsPage';
import { DeliveredCostPage } from './pages/DeliveredCostPage';
import { ManualEntryPage } from './pages/ManualEntryPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';

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

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/island" element={<PublicIndexPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />
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
          <Route path="capture/manual" element={<ManualEntryPage />} />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="receipts/:id" element={<ReceiptReviewPage />} />
          <Route path="prices" element={<PricesPage />} />
          <Route path="prices/index" element={<PriceIndexPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="delivered" element={<DeliveredCostPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

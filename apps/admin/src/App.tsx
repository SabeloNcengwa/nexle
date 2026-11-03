import { useAuth } from '@mavundla/client';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StaffLayout } from './components/StaffLayout';
import { CategoriesPage } from './pages/CategoriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { ModerationPage } from './pages/ModerationPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SellersPage } from './pages/SellersPage';
import { SignInPage } from './pages/SignInPage';
import { AccountPage } from './pages/AccountPage';
import { SupportPage } from './pages/SupportPage';

function StaffOnly({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <p style={{ padding: '2rem' }}>Loading…</p>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!(profile?.platformRoles?.length ?? 0)) {
    return <Navigate to="/sign-in" replace />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route
        element={
          <StaffOnly>
            <StaffLayout />
          </StaffOnly>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="sellers" element={<SellersPage />} />
        <Route path="moderation" element={<ModerationPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

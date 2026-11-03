import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './auth/AuthProvider';
import { HomePage } from './pages/HomePage';
import { BrowsePage } from './pages/BrowsePage';
import { ProductPage } from './pages/ProductPage';
import { SignInPage } from './pages/SignInPage';
import { RegisterPage } from './pages/RegisterPage';
import { AccountPage } from './pages/AccountPage';
import { SellerCentrePage } from './pages/SellerCentrePage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { MockPayPage } from './pages/MockPayPage';
import { OrderDetailPage, OrdersListPage } from './pages/OrdersPage';
import { canAccessSellerCentre } from './lib/roleHome';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!user) {
    const next = encodeURIComponent(
      typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/',
    );
    return <Navigate to={`/auth/sign-in?next=${next}`} replace />;
  }
  return children;
}

/** Customers cannot open Seller Centre — redirect to account. */
function SellerOnly({ children }: { children: ReactNode }) {
  const { user, profile, memberships, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!user) {
    const next = encodeURIComponent(
      typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/seller',
    );
    return <Navigate to={`/auth/sign-in?next=${next}`} replace />;
  }
  if (!canAccessSellerCentre(profile, memberships)) {
    return <Navigate to="/account?notice=seller-only" replace />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="products/:productId" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="mock-pay" element={<MockPayPage />} />
        <Route path="auth/sign-in" element={<SignInPage />} />
        <Route path="auth/register" element={<RegisterPage />} />
        <Route
          path="account"
          element={
            <Protected>
              <AccountPage />
            </Protected>
          }
        />
        <Route
          path="orders"
          element={
            <Protected>
              <OrdersListPage />
            </Protected>
          }
        />
        <Route
          path="orders/:orderId"
          element={
            <Protected>
              <OrderDetailPage />
            </Protected>
          }
        />
      </Route>
      <Route
        path="seller/*"
        element={
          <SellerOnly>
            <SellerCentrePage />
          </SellerOnly>
        }
      />
    </Routes>
  );
}

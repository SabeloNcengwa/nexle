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
import { AdminPage } from './pages/AdminPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { MockPayPage } from './pages/MockPayPage';
import { OrderDetailPage, OrdersListPage } from './pages/OrdersPage';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/auth/sign-in" replace />;
  return children;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!profile?.platformRoles?.length) return <Navigate to="/" replace />;
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
        <Route
          path="seller/*"
          element={
            <Protected>
              <SellerCentrePage />
            </Protected>
          }
        />
        <Route
          path="admin/*"
          element={
            <Protected>
              <AdminOnly>
                <AdminPage />
              </AdminOnly>
            </Protected>
          }
        />
      </Route>
    </Routes>
  );
}

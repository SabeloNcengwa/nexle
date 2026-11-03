-- NEXLE marketplace schema on Supabase Postgres.
-- Document-oriented tables (id + jsonb data) mirror former Firestore collections.
-- API uses the service role / DB URL (bypasses RLS).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION nexle_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper: create a document table with common indexes
-- (expanded explicitly below for clarity in migrations)

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users ((data->>'email'));

CREATE TABLE IF NOT EXISTS seller_applications (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_applications_owner_idx ON seller_applications ((data->>'ownerUid'));
CREATE INDEX IF NOT EXISTS seller_applications_status_idx ON seller_applications ((data->>'status'));
CREATE INDEX IF NOT EXISTS seller_applications_submitted_idx ON seller_applications ((data->>'submittedAt') DESC);

CREATE TABLE IF NOT EXISTS sellers (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sellers_owner_idx ON sellers ((data->>'ownerUid'));
CREATE INDEX IF NOT EXISTS sellers_status_idx ON sellers ((data->>'status'));

CREATE TABLE IF NOT EXISTS seller_members (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_members_uid_idx ON seller_members ((data->>'uid'));
CREATE INDEX IF NOT EXISTS seller_members_seller_idx ON seller_members ((data->>'sellerId'));

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_sort_idx ON categories ((data->>'sortOrder'));

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_seller_idx ON products ((data->>'sellerId'));
CREATE INDEX IF NOT EXISTS products_status_idx ON products ((data->>'status'));
CREATE INDEX IF NOT EXISTS products_category_idx ON products ((data->>'categoryId'));
CREATE INDEX IF NOT EXISTS products_updated_idx ON products ((data->>'updatedAt') DESC);

CREATE TABLE IF NOT EXISTS inventory (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_product_idx ON inventory ((data->>'productId'));
CREATE INDEX IF NOT EXISTS inventory_seller_idx ON inventory ((data->>'sellerId'));

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews ((data->>'productId'));
CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews ((data->>'status'));

CREATE TABLE IF NOT EXISTS carts (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carts_owner_idx ON carts ((data->>'ownerUid'));

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders ((data->>'customerUid'));
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders ((data->>'createdAt') DESC);

CREATE TABLE IF NOT EXISTS seller_orders (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_orders_seller_idx ON seller_orders ((data->>'sellerId'));
CREATE INDEX IF NOT EXISTS seller_orders_order_idx ON seller_orders ((data->>'orderId'));

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments ((data->>'orderId'));
CREATE INDEX IF NOT EXISTS payments_provider_ref_idx ON payments ((data->>'providerRef'));

CREATE TABLE IF NOT EXISTS reservations (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations ((data->>'status'));
CREATE INDEX IF NOT EXISTS reservations_expires_idx ON reservations ((data->>'expiresAt'));

CREATE TABLE IF NOT EXISTS shipments (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_order_idx ON shipments ((data->>'orderId'));
CREATE INDEX IF NOT EXISTS shipments_seller_order_idx ON shipments ((data->>'sellerOrderId'));
CREATE INDEX IF NOT EXISTS shipments_provider_ref_idx ON shipments ((data->>'providerShipmentRef'));

CREATE TABLE IF NOT EXISTS returns (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS returns_order_idx ON returns ((data->>'orderId'));
CREATE INDEX IF NOT EXISTS returns_seller_idx ON returns ((data->>'sellerId'));
CREATE INDEX IF NOT EXISTS returns_status_idx ON returns ((data->>'status'));

CREATE TABLE IF NOT EXISTS refunds (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_order_idx ON refunds ((data->>'orderId'));
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds ((data->>'status'));

CREATE TABLE IF NOT EXISTS commission_plans (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_plans_default_idx ON commission_plans ((data->>'isDefault'));

CREATE TABLE IF NOT EXISTS seller_ledger (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_ledger_seller_idx ON seller_ledger ((data->>'sellerId'));
CREATE INDEX IF NOT EXISTS seller_ledger_created_idx ON seller_ledger ((data->>'createdAt') DESC);
CREATE INDEX IF NOT EXISTS seller_ledger_bucket_idx ON seller_ledger ((data->>'bucket'));

CREATE TABLE IF NOT EXISTS payouts (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_seller_idx ON payouts ((data->>'sellerId'));
CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts ((data->>'status'));

CREATE TABLE IF NOT EXISTS platform_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_uid_idx ON notifications ((data->>'toUid'));
CREATE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications ((data->>'dedupeKey'));

CREATE TABLE IF NOT EXISTS background_jobs (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS background_jobs_status_idx ON background_jobs ((data->>'status'));
CREATE INDEX IF NOT EXISTS background_jobs_run_after_idx ON background_jobs ((data->>'runAfter'));

CREATE TABLE IF NOT EXISTS support_notes (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_notes_resource_idx
  ON support_notes ((data->>'resourceType'), (data->>'resourceId'));

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on; API uses service role / direct DB URL which bypasses RLS.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Storage buckets (run via storage API / dashboard if insert not permitted here)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'seller-docs',
    'seller-docs',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'product-images',
    'product-images',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No anon/authenticated policies for seller-docs — uploads use signed URLs from the API.
-- Public read for product images:
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

import {
  formatZarFromCents,
  type LedgerEntry,
  type Payout,
  type Product,
  type ReturnRequest,
  type SellerApplication,
  type SellerBucketBalances,
  type SellerOrder,
  type Shipment,
} from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

function ApplicationsPanel() {
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => apiFetch<SellerApplication[]>('/v1/sellers/applications/mine'),
  });

  const [form, setForm] = useState({
    businessName: '',
    contactEmail: '',
    contactPhone: '',
    line1: '',
    suburb: '',
    city: '',
    province: 'Gauteng',
    postalCode: '',
    sellerAgreementVersion: '2026-01',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<SellerApplication>('/v1/sellers/applications', {
        method: 'POST',
        body: JSON.stringify({
          businessName: form.businessName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          businessAddress: {
            line1: form.line1,
            suburb: form.suburb,
            city: form.city,
            province: form.province,
            postalCode: form.postalCode,
            country: 'ZA',
          },
          documentRefs: [],
          sellerAgreementVersion: form.sellerAgreementVersion,
        }),
      }),
    onSuccess: async () => {
      setMessage('Draft application saved.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = useMutation({
    mutationFn: (applicationId: string) =>
      apiFetch<SellerApplication>('/v1/sellers/applications/submit', {
        method: 'POST',
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: async () => {
      setMessage('Application submitted for review.');
      await qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className={styles.stack}>
      <h2>Seller application</h2>
      <p className={styles.muted}>
        Lifecycle: draft → submitted → under review → approved or rejected. Selling unlocks only after
        approval.
      </p>

      {apps.data && apps.data.length > 0 && (
        <div className={styles.panel}>
          <h3>Your applications</h3>
          <ul>
            {apps.data.map((a) => (
              <li key={a.id}>
                <strong>{a.businessName}</strong> — {a.status}
                {(a.status === 'draft' || a.status === 'rejected') && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => submit.mutate(a.id)}
                    >
                      Submit
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={onCreate}>
        <h3>New draft application</h3>
        {(
          [
            ['businessName', 'Business name'],
            ['contactEmail', 'Contact email'],
            ['contactPhone', 'Contact phone'],
            ['line1', 'Address line 1'],
            ['suburb', 'Suburb'],
            ['city', 'City'],
            ['province', 'Province'],
            ['postalCode', 'Postal code (4 digits)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className={styles.field}>
            {label}
            <input
              required
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
        {message && <p>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btn} type="submit" disabled={create.isPending}>
          Save draft
        </button>
      </form>
    </div>
  );
}

function ProductsPanel() {
  const [sellerId, setSellerId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sku, setSku] = useState('SKU-001');
  const [priceCents, setPriceCents] = useState(1999);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const products = useQuery({
    queryKey: ['seller-products', sellerId],
    enabled: sellerId.length > 0,
    queryFn: () => apiFetch<Product[]>(`/v1/catalogue/sellers/${sellerId}/products`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Product>('/v1/catalogue/products', {
        method: 'POST',
        body: JSON.stringify({
          sellerId,
          title,
          description,
          categoryId,
          attributes: {},
          images: [
            {
              path: `sellers/${sellerId}/products/placeholder/cover.jpg`,
              contentType: 'image/jpeg',
              sortOrder: 0,
            },
          ],
          variants: [
            {
              sku,
              title: 'Default',
              priceCents,
              attributes: {},
            },
          ],
          taxClassification: 'standard',
          handlingTimeDays: 2,
        }),
      }),
    onSuccess: async () => {
      setMessage('Product draft created.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['seller-products', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const submitReview = useMutation({
    mutationFn: (productId: string) =>
      apiFetch('/v1/catalogue/products/submit', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      }),
    onSuccess: async () => {
      setMessage('Submitted for moderation.');
      await qc.invalidateQueries({ queryKey: ['seller-products', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.stack}>
      <h2>Products</h2>
      <label className={styles.field}>
        Seller ID (from approval response / admin)
        <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} required />
      </label>

      <form
        className={`${styles.panel} ${styles.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h3>Create draft listing</h3>
        <label className={styles.field}>
          Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={styles.field}>
          Description
          <textarea
            required
            minLength={10}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Category ID
          <input required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
        </label>
        <label className={styles.field}>
          SKU
          <input required value={sku} onChange={(e) => setSku(e.target.value)} />
        </label>
        <label className={styles.field}>
          Price (cents)
          <input
            type="number"
            required
            min={0}
            value={priceCents}
            onChange={(e) => setPriceCents(Number(e.target.value))}
          />
        </label>
        {message && <p>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btn} type="submit">
          Create draft
        </button>
      </form>

      {products.data && (
        <div className={styles.panel}>
          <h3>Your listings</h3>
          <ul>
            {products.data.map((p) => (
              <li key={p.id}>
                {p.title} — {p.status}{' '}
                {(p.status === 'draft' || p.status === 'rejected') && (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => submitReview.mutate(p.id)}
                  >
                    Submit for review
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OrdersPanel() {
  const [sellerId, setSellerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ['seller-orders', sellerId],
    enabled: sellerId.length > 0,
    queryFn: () => apiFetch<SellerOrder[]>(`/v1/orders/by-seller/${sellerId}`),
  });

  const ship = useMutation({
    mutationFn: (sellerOrderId: string) =>
      apiFetch<Shipment>('/v1/fulfilment/shipments', {
        method: 'POST',
        body: JSON.stringify({
          sellerOrderId,
          serviceCode: 'MOCK_STANDARD',
          idempotencyKey: crypto.randomUUID(),
          parcel: { lengthCm: 25, widthCm: 20, heightCm: 10, weightGrams: 900 },
        }),
      }),
    onSuccess: async (data) => {
      setMessage(`Booked shipment ${data.trackingNumber} (confirmed booking, not an estimate).`);
      setError(null);
      await qc.invalidateQueries({ queryKey: ['seller-orders', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.stack}>
      <h2>Incoming seller orders</h2>
      <label className={styles.field}>
        Seller ID
        <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} />
      </label>
      {message && <p>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {orders.data?.length === 0 && <p className={styles.muted}>No seller orders yet.</p>}
      <ul className={styles.stack}>
        {orders.data?.map((o) => (
          <li key={o.id} className={styles.panel}>
            <strong>{o.id}</strong> — {o.status}
            <div>
              Parent {o.orderId} · {formatZarFromCents(o.subtotalCents)} + delivery{' '}
              {formatZarFromCents(o.deliveryCents)}
            </div>
            <ul>
              {o.lines.map((l) => (
                <li key={`${l.productId}_${l.sku}`}>
                  {l.title} × {l.quantity}
                </li>
              ))}
            </ul>
            {o.status === 'confirmed' && (
              <button type="button" className={styles.btn} onClick={() => ship.mutate(o.id)}>
                Book mock shipment
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReturnsPanel() {
  const [sellerId, setSellerId] = useState('');
  const qc = useQueryClient();
  const returns = useQuery({
    queryKey: ['seller-returns', sellerId],
    enabled: sellerId.length > 0,
    queryFn: () => apiFetch<ReturnRequest[]>(`/v1/fulfilment/returns/by-seller/${sellerId}`),
  });

  const review = useMutation({
    mutationFn: (payload: { returnId: string; decision: 'approved' | 'rejected' }) =>
      apiFetch('/v1/fulfilment/returns/review', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['seller-returns', sellerId] });
    },
  });

  const label = useMutation({
    mutationFn: (returnId: string) =>
      apiFetch(`/v1/fulfilment/returns/${returnId}/label`, { method: 'POST', body: '{}' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['seller-returns', sellerId] });
    },
  });

  const received = useMutation({
    mutationFn: (returnId: string) =>
      apiFetch(`/v1/fulfilment/returns/${returnId}/received`, { method: 'POST', body: '{}' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['seller-returns', sellerId] });
    },
  });

  const inspect = useMutation({
    mutationFn: (returnId: string) =>
      apiFetch('/v1/fulfilment/returns/inspect', {
        method: 'POST',
        body: JSON.stringify({
          returnId,
          outcome: 'accepted',
          createRefund: true,
          notes: 'Accepted after inspection',
        }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['seller-returns', sellerId] });
    },
  });

  return (
    <div className={styles.stack}>
      <h2>Returns</h2>
      <label className={styles.field}>
        Seller ID
        <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} />
      </label>
      <ul className={styles.stack}>
        {returns.data?.map((r) => (
          <li key={r.id} className={styles.panel}>
            {r.id} — {r.status} — order {r.orderId}
            <div className={styles.row}>
              {r.status === 'requested' && (
                <>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => review.mutate({ returnId: r.id, decision: 'approved' })}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => review.mutate({ returnId: r.id, decision: 'rejected' })}
                  >
                    Reject
                  </button>
                </>
              )}
              {r.status === 'approved' && (
                <button type="button" className={styles.btn} onClick={() => label.mutate(r.id)}>
                  Create return label
                </button>
              )}
              {(r.status === 'label_created' || r.status === 'in_transit') && (
                <button type="button" className={styles.btn} onClick={() => received.mutate(r.id)}>
                  Mark received
                </button>
              )}
              {r.status === 'received' && (
                <button type="button" className={styles.btn} onClick={() => inspect.mutate(r.id)}>
                  Inspect + accept
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinancePanel() {
  const [sellerId, setSellerId] = useState('');
  const [amountCents, setAmountCents] = useState(1000);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const ledger = useQuery({
    queryKey: ['seller-ledger', sellerId],
    enabled: sellerId.length > 0,
    queryFn: () =>
      apiFetch<{ entries: LedgerEntry[]; balances: SellerBucketBalances }>(
        `/v1/finance/ledger/${sellerId}`,
      ),
  });

  const payouts = useQuery({
    queryKey: ['seller-payouts', sellerId],
    enabled: sellerId.length > 0,
    queryFn: () => apiFetch<Payout[]>(`/v1/finance/payouts/by-seller/${sellerId}`),
  });

  const requestPayout = useMutation({
    mutationFn: () =>
      apiFetch('/v1/finance/payouts', {
        method: 'POST',
        body: JSON.stringify({
          sellerId,
          amountCents,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: async () => {
      setMessage('Payout requested (eligible balance). Finance must approve and reconcile.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['seller-payouts', sellerId] });
      await qc.invalidateQueries({ queryKey: ['seller-ledger', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.stack}>
      <h2>Finance</h2>
      <p className={styles.muted}>
        Append-only ledger. Pending proceeds become eligible after hold/release. Not described as
        escrow.
      </p>
      <label className={styles.field}>
        Seller ID
        <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} />
      </label>
      {ledger.data && (
        <div className={styles.panel}>
          <h3>Balances</h3>
          <p>
            Pending {formatZarFromCents(ledger.data.balances.pending)} · Eligible{' '}
            {formatZarFromCents(ledger.data.balances.eligible)} · Held{' '}
            {formatZarFromCents(ledger.data.balances.held)} · Paid{' '}
            {formatZarFromCents(ledger.data.balances.paid)}
          </p>
          <ul>
            {ledger.data.entries.slice(0, 20).map((e) => (
              <li key={e.id}>
                {e.type} {e.sign > 0 ? '+' : '-'}
                {formatZarFromCents(e.amountCents)} ({e.bucket})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.panel}>
        <h3>Request payout</h3>
        <label className={styles.field}>
          Amount (cents)
          <input
            type="number"
            min={1}
            value={amountCents}
            onChange={(e) => setAmountCents(Number(e.target.value))}
          />
        </label>
        <button type="button" className={styles.btn} onClick={() => requestPayout.mutate()}>
          Request payout
        </button>
        {message && <p>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
      <div className={styles.panel}>
        <h3>Payouts</h3>
        <ul>
          {payouts.data?.map((p) => (
            <li key={p.id}>
              {p.id} — {p.status} — {formatZarFromCents(p.amountCents)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SellerCentrePage() {
  return (
    <div className={styles.stack}>
      <h1>Nexle Seller Centre</h1>
      <nav className={styles.row}>
        <Link to="/seller">Application</Link>
        <Link to="/seller/products">Products</Link>
        <Link to="/seller/orders">Orders</Link>
        <Link to="/seller/returns">Returns</Link>
        <Link to="/seller/finance">Finance</Link>
      </nav>
      <Routes>
        <Route index element={<ApplicationsPanel />} />
        <Route path="products" element={<ProductsPanel />} />
        <Route path="orders" element={<OrdersPanel />} />
        <Route path="returns" element={<ReturnsPanel />} />
        <Route path="finance" element={<FinancePanel />} />
      </Routes>
    </div>
  );
}

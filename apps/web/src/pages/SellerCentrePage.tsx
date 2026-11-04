import { useAuth } from '@mavundla/client';
import {
  DEFAULT_PLATFORM_COMMISSION_BPS,
  formatZarFromCents,
  MERCHANT_CONTRACT,
  MERCHANT_CONTRACT_VERSION,
  REQUIRED_SELLER_DOCUMENT_KINDS,
  type LedgerEntry,
  type Payout,
  type Product,
  type ReturnRequest,
  type Seller,
  type SellerApplication,
  type SellerBucketBalances,
  type SellerDocumentKind,
  type SellerDocumentRef,
  type SellerOrder,
  type Shipment,
} from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSellerId } from '../hooks/useSellerId';
import { apiFetch } from '../lib/api';
import { uploadViaSignedUrl } from '../lib/supabaseUpload';
import { openMerchantContractPrint } from '../seller/merchantContractPrint';
import {
  SignaturePad,
  type SignaturePadHandle,
} from '../seller/SignaturePad';
import styles from '../seller/seller.module.scss';

const UPLOADABLE_DOC_KINDS = (
  [...REQUIRED_SELLER_DOCUMENT_KINDS, ...(['vat_certificate'] as const)] as SellerDocumentKind[]
).filter((k) => k !== 'signed_merchant_contract');

const KIND_LABELS: Record<SellerDocumentKind, string> = {
  cipc_registration: 'CIPC company registration',
  director_id: 'Director / owner ID',
  proof_of_address: 'Proof of business address',
  bank_confirmation: 'Bank confirmation letter',
  signed_merchant_contract: 'Signed merchant agreement',
  vat_certificate: 'VAT certificate (optional)',
};

function statusPill(status: string) {
  if (['active', 'delivered', 'paid', 'approved', 'published'].includes(status)) {
    return styles.pillOk;
  }
  if (['confirmed', 'processing', 'pending_review', 'submitted', 'under_review', 'eligible'].includes(status)) {
    return styles.pillWarn;
  }
  if (['rejected', 'cancelled', 'suspended', 'failed'].includes(status)) {
    return styles.pillDanger;
  }
  if (status === 'draft') return styles.pillMuted;
  return styles.pillBrand;
}

type SellerGate = 'approved' | 'pending_review' | 'can_apply' | 'staff_only';

function applicationStatusCopy(status: string | undefined): {
  title: string;
  detail: string;
  label: string;
} {
  switch (status) {
    case 'submitted':
      return {
        label: 'Submitted — waiting for review',
        title: 'Application completed',
        detail:
          'Your documents and signed agreement are with Nexle staff. We’ll review them next. You don’t need to resubmit — watch this page for updates.',
      };
    case 'under_review':
      return {
        label: 'Under review',
        title: 'Staff are reviewing your application',
        detail:
          'Nexle is checking your company documents and agreement. After approval, Seller Centre unlocks orders, catalogue, and payouts.',
      };
    case 'approved':
      return {
        label: 'Approved',
        title: 'You’re approved',
        detail: 'Your seller account is active. Use Home to manage orders and catalogue.',
      };
    case 'rejected':
      return {
        label: 'Needs changes',
        title: 'Application needs updates',
        detail:
          'Staff rejected this application. Update your details or documents, then submit again.',
      };
    case 'draft':
      return {
        label: 'Draft',
        title: 'Application in progress',
        detail: 'Finish your details, sign the agreement, upload documents, then submit.',
      };
    default:
      return {
        label: 'Not started',
        title: 'Become a Nexle seller',
        detail: 'Start an application when you’re ready to sell on the marketplace.',
      };
  }
}

function pageMeta(pathname: string, gate: SellerGate): { title: string; subtitle: string } {
  if (pathname.includes('/apply')) {
    return {
      title: 'Join as a seller',
      subtitle: 'Share your company details — you run the shop, Nexle brings the customers.',
    };
  }
  if (pathname.includes('/products')) {
    return {
      title: 'Your catalogue',
      subtitle: 'Listings you own and fulfil. Live products sell on the Nexle storefront.',
    };
  }
  if (pathname.includes('/orders')) {
    return {
      title: 'Orders to fulfil',
      subtitle: 'Customers buy on Nexle — you pack, ship, and mark them on their way.',
    };
  }
  if (pathname.includes('/returns')) {
    return {
      title: 'Returns',
      subtitle: 'Handle return requests for stock you sold.',
    };
  }
  if (pathname.includes('/finance')) {
    return {
      title: 'Payouts & ledger',
      subtitle: 'See what you’ve earned and request payouts when eligible.',
    };
  }
  if (gate === 'pending_review') {
    return {
      title: 'Application status',
      subtitle: 'Submitted — waiting for Nexle staff to review.',
    };
  }
  return {
    title: gate === 'approved' ? 'Seller home' : 'Seller Centre',
    subtitle:
      gate === 'approved'
        ? 'Your command centre — sales, fulfilment, and catalogue in one place.'
        : 'Apply once. After approval, you manage every order yourself.',
  };
}

function SellerShell({ gate, children }: { gate: SellerGate; children: ReactNode }) {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const meta = pageMeta(location.pathname, gate);

  const links =
    gate === 'approved'
      ? [
          { to: '/seller', end: true, label: 'Home', icon: '◆' },
          { to: '/seller/orders', label: 'Orders', icon: '▣' },
          { to: '/seller/products', label: 'Catalogue', icon: '◇' },
          { to: '/seller/returns', label: 'Returns', icon: '↺' },
          { to: '/seller/finance', label: 'Finance', icon: 'R' },
        ]
      : gate === 'can_apply'
        ? [
            { to: '/seller', end: true, label: 'Home', icon: '◆' },
            { to: '/seller/apply', label: 'Application', icon: '✎' },
          ]
        : [{ to: '/seller', end: true, label: 'Home', icon: '◆' }];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/nexle-logo.png" alt="" />
          <div className={styles.brandText}>
            <span className={styles.brandName}>Nexle</span>
            <span className={styles.brandSub}>Seller portal</span>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Seller">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? styles.navActive : undefined)}
            >
              <span className={styles.navIcon} aria-hidden>
                {l.icon}
              </span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <strong>{profile?.displayName ?? 'Seller'}</strong>
          <Link to="/">Back to storefront</Link>
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topBar}>
          <div>
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <a className={styles.storeLink} href="/" target="_blank" rel="noreferrer">
            View shop ↗
          </a>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}

function OverviewPanel({ gate, latestApp }: { gate: SellerGate; latestApp?: SellerApplication }) {
  const sellerId = useSellerId();
  const approved = gate === 'approved';

  const orders = useQuery({
    queryKey: ['seller-orders', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () => apiFetch<SellerOrder[]>(`/v1/orders/by-seller/${sellerId}`),
  });
  const products = useQuery({
    queryKey: ['seller-products', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () => apiFetch<Product[]>(`/v1/catalogue/sellers/${sellerId}/products`),
  });
  const ledger = useQuery({
    queryKey: ['seller-ledger', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () =>
      apiFetch<{ entries: LedgerEntry[]; balances: SellerBucketBalances }>(
        `/v1/finance/ledger/${sellerId}`,
      ),
  });

  const stats = useMemo(() => {
    const list = orders.data ?? [];
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekOrders = list.filter((o) => (o.createdAt ? Date.parse(o.createdAt) : 0) >= weekAgo);
    const gmv = list.reduce((s, o) => s + o.subtotalCents, 0);
    const awaiting = list.filter((o) =>
      ['confirmed', 'processing', 'paid'].includes(o.status),
    );
    const soldIds = new Set<string>();
    for (const o of list) for (const line of o.lines) soldIds.add(line.productId);
    const catalogue = products.data ?? [];
    return {
      weekCount: weekOrders.length,
      gmv,
      awaiting,
      sold: catalogue.filter((p) => soldIds.has(p.id)).length,
      unsold: catalogue.filter((p) => p.status === 'active' && !soldIds.has(p.id)).length,
      live: catalogue.filter((p) => p.status === 'active').length,
      draft: catalogue.filter((p) => p.status === 'draft' || p.status === 'pending_review').length,
    };
  }, [orders.data, products.data]);

  if (!approved) {
    const adminUrl = import.meta.env.VITE_ADMIN_BASE_URL ?? 'http://localhost:5174';
    const copy = applicationStatusCopy(latestApp?.status);

    if (gate === 'staff_only') {
      return (
        <>
          <div className={styles.heroBanner}>
            <div>
              <h2>This is the Seller Centre</h2>
              <p>
                You&apos;re signed in as Nexle staff. Approving sellers, catalogue, and finance live
                in the Staff console — a different app (and you must sign in there separately).
              </p>
            </div>
            <a className={styles.btn} href={adminUrl}>
              Open Staff console
            </a>
          </div>
          <div className={styles.panel}>
            <p className={styles.muted} style={{ margin: 0 }}>
              Staff accounts do not run a merchant shop. Sign out and use a seller account, or open
              the Staff console to approve real seller applications.
            </p>
          </div>
        </>
      );
    }

    if (gate === 'pending_review') {
      return (
        <>
          <div className={styles.heroBanner}>
            <div>
              <h2>{copy.title}</h2>
              <p>{copy.detail}</p>
            </div>
            <span className={statusPill(latestApp?.status ?? 'submitted')}>{copy.label}</span>
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h3>{latestApp?.businessName ?? 'Your application'}</h3>
              <span className={statusPill(latestApp?.status ?? 'submitted')}>
                {latestApp?.status}
              </span>
            </div>
            <ol className={styles.muted} style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>Nexle staff review your company documents and e-signed agreement.</li>
              <li>If anything is missing, we&apos;ll ask you to update — then you can resubmit.</li>
              <li>When approved, this portal unlocks orders, catalogue, returns, and payouts.</li>
            </ol>
          </div>
        </>
      );
    }

    return (
      <>
        <div className={styles.heroBanner}>
          <div>
            <h2>Sell on Nexle — you stay in control</h2>
            <p>
              List your products, fulfil every order from your own stock, and get paid through the
              ledger. Nexle is the marketplace; you are the merchant.
            </p>
          </div>
          <Link className={styles.btn} to="/seller/apply">
            {latestApp ? 'Continue application' : 'Start application'}
          </Link>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Application status</h3>
            <span className={statusPill(latestApp?.status ?? 'draft')}>{copy.label}</span>
          </div>
          <p className={styles.muted}>{copy.detail}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.heroBanner}>
        <div>
          <h2>Good selling day</h2>
          <p>
            {stats.awaiting.length > 0
              ? `${stats.awaiting.length} order${stats.awaiting.length === 1 ? '' : 's'} waiting for you to ship.`
              : 'No open fulfilment — keep an eye on new sales as they come in.'}{' '}
            You fulfil; Nexle handles discovery and checkout.
          </p>
        </div>
        <Link className={styles.btn} to="/seller/orders">
          Open orders
        </Link>
      </div>

      <div className={styles.kpiGrid}>
        <div className={styles.kpi} style={{ animationDelay: '40ms' }}>
          <div className={styles.kpiValue}>{stats.weekCount}</div>
          <div className={styles.kpiLabel}>Orders · 7 days</div>
        </div>
        <div className={styles.kpi} style={{ animationDelay: '80ms' }}>
          <div className={styles.kpiValue}>{formatZarFromCents(stats.gmv)}</div>
          <div className={styles.kpiLabel}>GMV sold</div>
        </div>
        <div className={styles.kpi} style={{ animationDelay: '120ms' }}>
          <div className={styles.kpiValue}>{stats.awaiting.length}</div>
          <div className={styles.kpiLabel}>To ship</div>
          {stats.awaiting.length > 0 && <div className={styles.kpiHint}>Action needed</div>}
        </div>
        <div className={styles.kpi} style={{ animationDelay: '160ms' }}>
          <div className={styles.kpiValue}>{stats.live}</div>
          <div className={styles.kpiLabel}>Live listings</div>
        </div>
        <div className={styles.kpi} style={{ animationDelay: '200ms' }}>
          <div className={styles.kpiValue}>{stats.sold}</div>
          <div className={styles.kpiLabel}>With sales</div>
        </div>
        <div className={styles.kpi} style={{ animationDelay: '240ms' }}>
          <div className={styles.kpiValue}>{stats.unsold}</div>
          <div className={styles.kpiLabel}>Live · not yet sold</div>
        </div>
        <div className={styles.kpi} style={{ animationDelay: '280ms' }}>
          <div className={styles.kpiValue}>
            {ledger.data ? formatZarFromCents(ledger.data.balances.eligible) : '—'}
          </div>
          <div className={styles.kpiLabel}>Eligible payout</div>
        </div>
      </div>

      <div className={styles.split}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Fulfilment queue</h3>
            <Link className={styles.btnLink} to="/seller/orders">
              View all
            </Link>
          </div>
          {stats.awaiting.length === 0 ? (
            <div className={styles.empty}>
              <strong>All clear</strong>
              New orders to pack will appear here.
            </div>
          ) : (
            <ul className={styles.attentionList}>
              {stats.awaiting.slice(0, 5).map((o) => (
                <li key={o.id} className={styles.attentionItem}>
                  <div>
                    <strong>{o.lines[0]?.title ?? o.id}</strong>
                    <div className={styles.muted}>
                      {o.lines.length} line{o.lines.length === 1 ? '' : 's'} ·{' '}
                      {formatZarFromCents(o.subtotalCents)}
                    </div>
                  </div>
                  <span className={statusPill(o.status)}>{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Catalogue pulse</h3>
            <Link className={styles.btnLink} to="/seller/products">
              Manage
            </Link>
          </div>
          <ul className={styles.attentionList}>
            <li className={styles.attentionItem}>
              <span>Live on storefront</span>
              <strong>{stats.live}</strong>
            </li>
            <li className={styles.attentionItem}>
              <span>Draft / not live</span>
              <strong>{stats.draft}</strong>
            </li>
            <li className={styles.attentionItem}>
              <span>Not yet sold</span>
              <strong>{stats.unsold}</strong>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

function ApplicationsPanel({ gate, latestApp }: { gate: SellerGate; latestApp?: SellerApplication }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => apiFetch<SellerApplication[]>('/v1/sellers/applications/mine'),
  });

  if (gate === 'pending_review' || gate === 'approved') {
    const copy = applicationStatusCopy(latestApp?.status ?? (gate === 'approved' ? 'approved' : 'submitted'));
    return <Navigate to="/seller" replace state={{ notice: copy.label }} />;
  }

  if (gate === 'staff_only') {
    return <Navigate to="/seller" replace />;
  }

  const [form, setForm] = useState({
    businessName: '',
    contactEmail: '',
    contactPhone: '',
    line1: '',
    suburb: '',
    city: '',
    province: 'Gauteng',
    postalCode: '',
    sellerAgreementVersion: MERCHANT_CONTRACT_VERSION,
  });
  const [docs, setDocs] = useState<Partial<Record<SellerDocumentKind, SellerDocumentRef>>>({});
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<SellerDocumentKind | null>(null);
  const [signing, setSigning] = useState(false);
  const signaturePadRef = useRef<SignaturePadHandle | null>(null);

  const editableApp =
    apps.data?.find((a) => a.id === activeAppId) ??
    apps.data?.find((a) => a.status === 'draft' || a.status === 'rejected');

  const syncDocsFromApp = (app: SellerApplication) => {
    const next: Partial<Record<SellerDocumentKind, SellerDocumentRef>> = {};
    for (const d of app.documentRefs ?? []) next[d.kind] = d;
    setDocs(next);
    setActiveAppId(app.id);
  };

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
          documentRefs: Object.values(docs),
          sellerAgreementVersion: MERCHANT_CONTRACT_VERSION,
        }),
      }),
    onSuccess: async (app) => {
      setMessage('Draft saved — upload your company documents next.');
      setError(null);
      setActiveAppId(app.id);
      await qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const patchDocs = useMutation({
    mutationFn: async (nextDocs: SellerDocumentRef[]) => {
      if (!editableApp) throw new Error('Save a draft application first');
      return apiFetch<SellerApplication>(`/v1/sellers/applications/${editableApp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          businessName: editableApp.businessName,
          tradingName: editableApp.tradingName,
          registrationNumber: editableApp.registrationNumber,
          vatNumber: editableApp.vatNumber,
          contactEmail: editableApp.contactEmail,
          contactPhone: editableApp.contactPhone,
          businessAddress: editableApp.businessAddress,
          documentRefs: nextDocs,
          sellerAgreementVersion: MERCHANT_CONTRACT_VERSION,
        }),
      });
    },
    onSuccess: async (app) => {
      syncDocsFromApp(app);
      setMessage('Documents attached to your application.');
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
      setMessage('Submitted — Nexle staff will review your company documents.');
      await qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const uploadDoc = async (kind: SellerDocumentKind, file: File) => {
    const appId = editableApp?.id ?? activeAppId;
    if (!appId || !user) {
      setError('Save a draft application before uploading documents.');
      return;
    }
    setUploading(kind);
    setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `sellerApplications/${appId}/docs/${user.uid}/${kind}_${safeName}`;
      await uploadViaSignedUrl(path, file, file.type || 'application/octet-stream');
      const docRef: SellerDocumentRef = {
        kind,
        path,
        fileName: file.name,
        contentType: file.type,
        uploadedAt: new Date().toISOString(),
      };
      const nextMap = { ...docs, [kind]: docRef };
      setDocs(nextMap);
      await patchDocs.mutateAsync(Object.values(nextMap) as SellerDocumentRef[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const requiredReady = REQUIRED_SELLER_DOCUMENT_KINDS.every((k) => docs[k]);
  const agreementSigned = Boolean(docs.signed_merchant_contract);
  const showNewApplicationForm =
    gate === 'can_apply' && !editableApp && !(apps.data && apps.data.length > 0);

  const saveESignature = async () => {
    const appId = editableApp?.id ?? activeAppId;
    if (!appId || !user) {
      setError('Save a draft application before signing the agreement.');
      return;
    }
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      setError('Draw your signature on the pad first.');
      return;
    }
    setSigning(true);
    setError(null);
    try {
      const blob = await signaturePadRef.current.toPngBlob();
      const file = new File(
        [blob],
        `esignature_${MERCHANT_CONTRACT_VERSION}.png`,
        { type: 'image/png' },
      );
      await uploadDoc('signed_merchant_contract', file);
      setMessage('Agreement signed in-app and saved with your application.');
      signaturePadRef.current.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save signature');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className={styles.stack}>
      {apps.data && apps.data.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Your applications</h3>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {apps.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.businessName}</strong>
                    </td>
                    <td>
                      <span className={statusPill(a.status)}>{a.status}</span>
                    </td>
                    <td>
                      {(a.status === 'draft' || a.status === 'rejected') && (
                        <div className={styles.row}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => syncDocsFromApp(a)}
                          >
                            Documents
                          </button>
                          <button
                            type="button"
                            className={styles.btn}
                            disabled={!a.verificationChecklist?.documentsUploaded && !requiredReady}
                            onClick={() => submit.mutate(a.id)}
                          >
                            Submit
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showNewApplicationForm && (
        <form
          className={`${styles.panel} ${styles.stack}`}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className={styles.panelHead}>
            <h3>Business details</h3>
          </div>
          <div className={styles.split}>
            <div className={styles.stack}>
              {(
                [
                  ['businessName', 'Business name'],
                  ['contactEmail', 'Contact email'],
                  ['contactPhone', 'Contact phone'],
                  ['line1', 'Address line 1'],
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
            </div>
            <div className={styles.stack}>
              {(
                [
                  ['suburb', 'Suburb'],
                  ['city', 'City'],
                  ['province', 'Province'],
                  ['postalCode', 'Postal code'],
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
            </div>
          </div>
          <button className={styles.btn} type="submit" disabled={create.isPending}>
            Save draft
          </button>
        </form>
      )}

      {(editableApp || activeAppId) && (
        <section className={`${styles.panel} ${styles.stack}`}>
          <div className={styles.panelHead}>
            <h3>Merchant agreement</h3>
            <span className={styles.pillBrand}>Version {MERCHANT_CONTRACT.version}</span>
          </div>
          <p className={styles.muted} style={{ margin: 0 }}>
            {MERCHANT_CONTRACT.intro[0]} Read version {MERCHANT_CONTRACT.version}, then sign below
            in the app with your finger or mouse. Upload your other company documents separately.
          </p>
          <ol className={styles.muted} style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {MERCHANT_CONTRACT.clauses.map((clause) => (
              <li key={clause.number}>
                <strong>
                  {clause.number}. {clause.heading}.
                </strong>{' '}
                {clause.paragraphs[0]}
              </li>
            ))}
          </ol>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                try {
                  openMerchantContractPrint(editableApp?.businessName || form.businessName);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not open the contract');
                }
              }}
            >
              View full agreement
            </button>
            {agreementSigned && (
              <span className={styles.pillOk}>Signed · {docs.signed_merchant_contract!.fileName}</span>
            )}
          </div>
          <div className={styles.stack}>
            <strong>Draw your signature</strong>
            <p className={styles.muted} style={{ margin: 0 }}>
              An authorised person for {editableApp?.businessName || form.businessName || 'the business'}{' '}
              should sign here.
            </p>
            <SignaturePad
              padRef={signaturePadRef}
              disabled={signing || uploading === 'signed_merchant_contract'}
            />
            <button
              type="button"
              className={styles.btn}
              disabled={signing || uploading === 'signed_merchant_contract'}
              onClick={() => void saveESignature()}
            >
              {signing || uploading === 'signed_merchant_contract'
                ? 'Saving signature…'
                : agreementSigned
                  ? 'Re-sign & save agreement'
                  : 'Sign & save agreement'}
            </button>
          </div>
        </section>
      )}

      {(editableApp || activeAppId) && (
        <section className={`${styles.panel} ${styles.stack}`}>
          <div className={styles.panelHead}>
            <h3>Company documents</h3>
            <span className={requiredReady ? styles.pillOk : styles.pillWarn}>
              {requiredReady ? 'Ready to submit' : 'Required docs incomplete'}
            </span>
          </div>
          <p className={styles.muted}>
            Upload CIPC, ID, address, and bank proof here. The merchant agreement is signed above —
            no scan needed. PDF, JPEG, or PNG · max 10MB each.
          </p>
          <div className={styles.docGrid}>
            {UPLOADABLE_DOC_KINDS.map((kind) => (
              <div
                key={kind}
                className={`${styles.docCard} ${docs[kind] ? styles.docCardReady : ''}`}
              >
                <strong>
                  {KIND_LABELS[kind]}
                  {REQUIRED_SELLER_DOCUMENT_KINDS.includes(
                    kind as (typeof REQUIRED_SELLER_DOCUMENT_KINDS)[number],
                  )
                    ? ' *'
                    : ' (optional)'}
                </strong>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  disabled={uploading === kind}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadDoc(kind, file);
                  }}
                />
                {docs[kind] && <span className={styles.muted}>Uploaded · {docs[kind]!.fileName}</span>}
              </div>
            ))}
          </div>
          {editableApp && (editableApp.status === 'draft' || editableApp.status === 'rejected') && (
            <button
              type="button"
              className={styles.btn}
              disabled={!requiredReady || submit.isPending}
              onClick={() => submit.mutate(editableApp.id)}
            >
              Submit for review
            </button>
          )}
        </section>
      )}

      {message && <p>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

function ProductsPanel() {
  const sellerId = useSellerId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sku, setSku] = useState('SKU-001');
  const [priceCents, setPriceCents] = useState(1999);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  const products = useQuery({
    queryKey: ['seller-products', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () => apiFetch<Product[]>(`/v1/catalogue/sellers/${sellerId}/products`),
  });
  const orders = useQuery({
    queryKey: ['seller-orders', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () => apiFetch<SellerOrder[]>(`/v1/orders/by-seller/${sellerId}`),
  });

  const soldIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders.data ?? []) for (const line of o.lines) ids.add(line.productId);
    return ids;
  }, [orders.data]);

  const create = useMutation({
    mutationFn: async () => {
      if (!sellerId) throw new Error('No seller account');
      const productId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      let images: Product['images'] = [];
      if (imageFile) {
        const path = `sellers/${sellerId}/products/${productId}/cover.jpg`;
        const contentType = (
          imageFile.type === 'image/png'
            ? 'image/png'
            : imageFile.type === 'image/webp'
              ? 'image/webp'
              : 'image/jpeg'
        ) as 'image/jpeg' | 'image/png' | 'image/webp';
        await uploadViaSignedUrl(path, imageFile, contentType);
        images = [{ path, contentType, sortOrder: 0 }];
      } else {
        images = [
          {
            path: `sellers/${sellerId}/products/${productId}/placeholder.jpg`,
            contentType: 'image/jpeg',
            sortOrder: 0,
          },
        ];
      }
      return apiFetch<Product>('/v1/catalogue/products', {
        method: 'POST',
        body: JSON.stringify({
          sellerId,
          title,
          description,
          categoryId,
          attributes: {},
          images,
          variants: [{ sku, title: 'Default', priceCents, attributes: {} }],
          taxClassification: 'standard',
          handlingTimeDays: 2,
        }),
      });
    },
    onSuccess: async () => {
      setMessage('Draft listing created.');
      setError(null);
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['seller-products', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const publishListing = useMutation({
    mutationFn: (productId: string) =>
      apiFetch('/v1/catalogue/products/submit', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      }),
    onSuccess: async () => {
      setMessage('Listing published — it’s live on the storefront.');
      await qc.invalidateQueries({ queryKey: ['seller-products', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!sellerId) return <Navigate to="/seller/apply" replace />;

  return (
    <div className={styles.stack}>
      <div className={styles.row} style={{ justifyContent: 'space-between' }}>
        <p className={styles.muted} style={{ margin: 0 }}>
          You own inventory and fulfilment for every listing.
        </p>
        <button type="button" className={styles.btn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : 'New listing'}
        </button>
      </div>

      {showForm && (
        <form
          className={`${styles.panel} ${styles.stack}`}
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className={styles.panelHead}>
            <h3>Create draft listing</h3>
          </div>
          <div className={styles.split}>
            <div className={styles.stack}>
              <label className={styles.field}>
                Title
                <input required value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className={styles.field}>
                Description
                <textarea
                  required
                  minLength={10}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                Cover image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className={styles.stack}>
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
            </div>
          </div>
          <button className={styles.btn} type="submit">
            Create draft
          </button>
        </form>
      )}

      {message && <p>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h3>Listings</h3>
        </div>
        {!products.data?.length ? (
          <div className={styles.empty}>
            <strong>No products yet</strong>
            Create a draft with a photo, then publish it to go live on the storefront.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Sales</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <div className={styles.muted}>{p.id}</div>
                    </td>
                    <td>
                      <span className={statusPill(p.status)}>{p.status}</span>
                    </td>
                    <td>
                      {p.status === 'active'
                        ? soldIds.has(p.id)
                          ? 'Has sales'
                          : 'Not yet sold'
                        : '—'}
                    </td>
                    <td>
                      {(p.status === 'draft' ||
                        p.status === 'rejected' ||
                        p.status === 'pending_review') && (
                        <button
                          type="button"
                          className={styles.btnGhost}
                          disabled={publishListing.isPending}
                          onClick={() => publishListing.mutate(p.id)}
                        >
                          Publish
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function OrdersPanel() {
  const sellerId = useSellerId();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ['seller-orders', sellerId],
    enabled: Boolean(sellerId),
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
      setMessage(`Shipment booked · tracking ${data.trackingNumber}`);
      setError(null);
      await qc.invalidateQueries({ queryKey: ['seller-orders', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!sellerId) return <Navigate to="/seller/apply" replace />;

  const filtered = (orders.data ?? []).filter((o) =>
    statusFilter ? o.status === statusFilter : true,
  );

  return (
    <div className={styles.stack}>
      <div className={styles.row} style={{ justifyContent: 'space-between' }}>
        <label className={styles.field} style={{ minWidth: '200px' }}>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All orders</option>
            <option value="confirmed">Confirmed · to ship</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      {message && <p>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.panel}>
        {!filtered.length ? (
          <div className={styles.empty}>
            <strong>No orders here</strong>
            When a customer buys your listing, fulfilment starts with you.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong className={styles.muted} style={{ color: 'inherit' }}>
                        {o.id.slice(0, 10)}…
                      </strong>
                      <div className={styles.muted}>Parent {o.orderId.slice(0, 8)}…</div>
                    </td>
                    <td>
                      {o.lines.map((l) => (
                        <div key={`${l.productId}_${l.sku}`}>
                          {l.title} × {l.quantity}
                        </div>
                      ))}
                    </td>
                    <td>
                      {formatZarFromCents(o.subtotalCents)}
                      <div className={styles.muted}>
                        + {formatZarFromCents(o.deliveryCents)} delivery
                      </div>
                    </td>
                    <td>
                      <span className={statusPill(o.status)}>{o.status}</span>
                    </td>
                    <td>
                      {o.status === 'confirmed' && (
                        <button type="button" className={styles.btn} onClick={() => ship.mutate(o.id)}>
                          Book shipment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ReturnsPanel() {
  const sellerId = useSellerId();
  const qc = useQueryClient();
  const returns = useQuery({
    queryKey: ['seller-returns', sellerId],
    enabled: Boolean(sellerId),
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

  if (!sellerId) return <Navigate to="/seller/apply" replace />;

  return (
    <section className={styles.panel}>
      {!returns.data?.length ? (
        <div className={styles.empty}>
          <strong>No open returns</strong>
          Return requests for your sold items will land here.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Return</th>
                <th>Order</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {returns.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.id.slice(0, 12)}…</td>
                  <td>{r.orderId.slice(0, 10)}…</td>
                  <td>
                    <span className={statusPill(r.status)}>{r.status}</span>
                  </td>
                  <td>
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
                          Create label
                        </button>
                      )}
                      {(r.status === 'label_created' || r.status === 'in_transit') && (
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => received.mutate(r.id)}
                        >
                          Mark received
                        </button>
                      )}
                      {r.status === 'received' && (
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => inspect.mutate(r.id)}
                        >
                          Inspect + accept
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinancePanel() {
  const sellerId = useSellerId();
  const feePercent = DEFAULT_PLATFORM_COMMISSION_BPS / 100;
  const sellerKeepPercent = 100 - feePercent;
  const [amountCents, setAmountCents] = useState(1000);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const qc = useQueryClient();

  const seller = useQuery({
    queryKey: ['seller', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () => apiFetch<Seller>(`/v1/sellers/${sellerId}`),
  });

  const ledger = useQuery({
    queryKey: ['seller-ledger', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () =>
      apiFetch<{ entries: LedgerEntry[]; balances: SellerBucketBalances }>(
        `/v1/finance/ledger/${sellerId}`,
      ),
  });
  const payouts = useQuery({
    queryKey: ['seller-payouts', sellerId],
    enabled: Boolean(sellerId),
    queryFn: () => apiFetch<Payout[]>(`/v1/finance/payouts/by-seller/${sellerId}`),
  });

  const bank = seller.data?.payoutBank;
  const bankReady = Boolean(bank?.accountNumber && bank.bankName && bank.accountName);

  const saveBank = useMutation({
    mutationFn: () =>
      apiFetch<Seller>(`/v1/sellers/${sellerId}/payout-bank`, {
        method: 'PUT',
        body: JSON.stringify({
          accountName: accountName.trim(),
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          ...(branchCode.trim() ? { branchCode: branchCode.trim() } : {}),
        }),
      }),
    onSuccess: async () => {
      setMessage('Business bank saved. Withdrawals will go here after the platform fee.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['seller', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
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
      setMessage('Withdrawal requested from eligible balance (already net of platform fee).');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['seller-payouts', sellerId] });
      await qc.invalidateQueries({ queryKey: ['seller-ledger', sellerId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!sellerId) return <Navigate to="/seller/apply" replace />;

  const bal = ledger.data?.balances;

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h3>How money works</h3>
        </div>
        <p className={styles.muted} style={{ margin: 0 }}>
          Customers pay Nexle’s single Paystack account — not your bank. Payment confirms in
          seconds so you can pack and ship immediately (fulfilment does not wait on payouts). On
          each sale we take {feePercent}% (Bolt-style platform fee) and credit you{' '}
          {sellerKeepPercent}% to pending. After the hold, withdraw eligible funds to your business
          bank; the fee and hold affect withdrawals only.
        </p>
      </section>

      <div className={styles.kpiGrid}>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{bal ? formatZarFromCents(bal.pending) : '—'}</div>
          <div className={styles.kpiLabel}>Pending</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{bal ? formatZarFromCents(bal.eligible) : '—'}</div>
          <div className={styles.kpiLabel}>Eligible</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{bal ? formatZarFromCents(bal.held) : '—'}</div>
          <div className={styles.kpiLabel}>Held</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{bal ? formatZarFromCents(bal.paid) : '—'}</div>
          <div className={styles.kpiLabel}>Paid out</div>
        </div>
      </div>

      <div className={styles.split}>
        <section className={`${styles.panel} ${styles.stack}`}>
          <div className={styles.panelHead}>
            <h3>Business bank (withdrawals)</h3>
          </div>
          {bankReady ? (
            <p className={styles.muted} style={{ margin: 0 }}>
              {bank!.accountName} · {bank!.bankName} · ••••
              {bank!.accountNumber.slice(-4)}
              {bank!.branchCode ? ` · branch ${bank!.branchCode}` : ''}
            </p>
          ) : (
            <p className={styles.muted} style={{ margin: 0 }}>
              Save the account that should receive your {sellerKeepPercent}% net proceeds.
            </p>
          )}
          <label className={styles.field}>
            Account name
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder={bank?.accountName ?? 'Business trading name'}
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            Bank
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={bank?.bankName ?? 'e.g. FNB, Standard Bank'}
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            Account number
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
              placeholder={bank ? `••••${bank.accountNumber.slice(-4)}` : '6–16 digits'}
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            Branch code (optional)
            <input
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={bank?.branchCode ?? '6 digits'}
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className={styles.btn}
            disabled={
              saveBank.isPending ||
              accountName.trim().length < 2 ||
              bankName.trim().length < 2 ||
              accountNumber.trim().length < 6
            }
            onClick={() => saveBank.mutate()}
          >
            {saveBank.isPending ? 'Saving…' : bankReady ? 'Update bank details' : 'Save bank details'}
          </button>
        </section>

        <section className={`${styles.panel} ${styles.stack}`}>
          <div className={styles.panelHead}>
            <h3>Withdraw</h3>
          </div>
          <p className={styles.muted} style={{ margin: 0 }}>
            Amount is from your eligible balance (already after {feePercent}% fee).
          </p>
          <label className={styles.field}>
            Amount (cents)
            <input
              type="number"
              min={1}
              value={amountCents}
              onChange={(e) => setAmountCents(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className={styles.btn}
            disabled={!bankReady || requestPayout.isPending}
            onClick={() => requestPayout.mutate()}
          >
            {requestPayout.isPending ? 'Requesting…' : 'Request withdrawal'}
          </button>
          {!bankReady && (
            <p className={styles.muted} style={{ margin: 0 }}>
              Add business bank details first.
            </p>
          )}
          {message && <p>{message}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h3>Recent withdrawals</h3>
        </div>
        {!payouts.data?.length ? (
          <p className={styles.muted}>No withdrawal requests yet.</p>
        ) : (
          <ul className={styles.attentionList}>
            {payouts.data.map((p) => (
              <li key={p.id} className={styles.attentionItem}>
                <span>{formatZarFromCents(p.amountCents)}</span>
                <span className={statusPill(p.status)}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h3>Ledger</h3>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Bucket</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(ledger.data?.entries ?? []).slice(0, 25).map((e) => (
                <tr key={e.id}>
                  <td>{e.type}</td>
                  <td>{e.bucket}</td>
                  <td>
                    {e.sign > 0 ? '+' : '−'}
                    {formatZarFromCents(e.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function SellerCentrePage() {
  const { profile } = useAuth();
  const sellerId = useSellerId();
  const apps = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => apiFetch<SellerApplication[]>('/v1/sellers/applications/mine'),
  });
  const latestApp = apps.data?.[0];
  const approved = Boolean(sellerId);
  const staffOnly = (profile?.platformRoles?.length ?? 0) > 0 && !approved;
  const pendingReview =
    !approved &&
    (latestApp?.status === 'submitted' || latestApp?.status === 'under_review');

  const gate: SellerGate = approved
    ? 'approved'
    : staffOnly
      ? 'staff_only'
      : pendingReview
        ? 'pending_review'
        : 'can_apply';

  return (
    <SellerShell gate={gate}>
      <Routes>
        <Route index element={<OverviewPanel gate={gate} latestApp={latestApp} />} />
        <Route
          path="apply"
          element={<ApplicationsPanel gate={gate} latestApp={latestApp} />}
        />
        <Route path="products" element={<ProductsPanel />} />
        <Route path="orders" element={<OrdersPanel />} />
        <Route path="returns" element={<ReturnsPanel />} />
        <Route path="finance" element={<FinancePanel />} />
      </Routes>
    </SellerShell>
  );
}

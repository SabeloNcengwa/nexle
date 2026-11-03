import {
  formatZarFromCents,
  type Payout,
  type Product,
  type Refund,
  type ReturnRequest,
  type SellerApplication,
  type Shipment,
} from '@mavundla/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function DashboardPage() {
  const sellers = useQuery({
    queryKey: ['seller-review-queue'],
    queryFn: () => apiFetch<SellerApplication[]>('/v1/sellers/applications/review-queue'),
  });
  const pending = useQuery({
    queryKey: ['pending-products'],
    queryFn: () => apiFetch<Product[]>('/v1/catalogue/products/pending'),
  });
  const refunds = useQuery({
    queryKey: ['refund-queue'],
    queryFn: () => apiFetch<Refund[]>('/v1/finance/refunds/queue'),
  });
  const payouts = useQuery({
    queryKey: ['payout-queue'],
    queryFn: () => apiFetch<Payout[]>('/v1/finance/payouts/queue'),
  });
  const support = useQuery({
    queryKey: ['support-dashboard'],
    queryFn: () =>
      apiFetch<{
        exceptionShipments: Shipment[];
        openReturns: ReturnRequest[];
        openRefunds: Refund[];
      }>('/v1/fulfilment/support/dashboard'),
  });

  const payoutCents =
    payouts.data?.filter((p) => p.status === 'eligible').reduce((s, p) => s + p.amountCents, 0) ??
    0;

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1>Marketplace operations</h1>
        <p className={styles.muted} style={{ margin: 0 }}>
          Sellers list and fulfil. Your job is to vet partners, keep the catalogue clean, and clear
          money queues.
        </p>
      </div>

      <div className={styles.hero}>
        <h2>Enable merchants — don’t run their shops</h2>
        <p>
          Every approved seller owns inventory, packing, and shipping. Review documents and listings
          so independent merchants can sell with confidence on Nexle.
        </p>
      </div>

      <div className={styles.kpiGrid}>
        <Link to="/sellers" className={styles.kpi}>
          <span className={styles.kpiValue}>{sellers.data?.length ?? '—'}</span>
          <span className={styles.kpiLabel}>Seller applications</span>
        </Link>
        <Link to="/moderation" className={styles.kpi}>
          <span className={styles.kpiValue}>{pending.data?.length ?? '—'}</span>
          <span className={styles.kpiLabel}>Listings to moderate</span>
        </Link>
        <Link to="/finance" className={styles.kpi}>
          <span className={styles.kpiValue}>{refunds.data?.length ?? '—'}</span>
          <span className={styles.kpiLabel}>Refunds in queue</span>
        </Link>
        <Link to="/finance" className={styles.kpi}>
          <span className={styles.kpiValue}>{payouts.data?.length ?? '—'}</span>
          <span className={styles.kpiLabel}>Payouts in queue</span>
        </Link>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>{formatZarFromCents(payoutCents)}</span>
          <span className={styles.kpiLabel}>Eligible payout total</span>
        </div>
        <Link to="/support" className={styles.kpi}>
          <span className={styles.kpiValue}>
            {(support.data?.exceptionShipments.length ?? 0) +
              (support.data?.openReturns.length ?? 0)}
          </span>
          <span className={styles.kpiLabel}>Support exceptions</span>
        </Link>
      </div>
    </div>
  );
}

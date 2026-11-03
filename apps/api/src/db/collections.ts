/** Firestore collection names → Postgres table names. */
export const COLLECTION_TABLES = {
  users: 'users',
  sellerApplications: 'seller_applications',
  sellers: 'sellers',
  sellerMembers: 'seller_members',
  categories: 'categories',
  products: 'products',
  inventory: 'inventory',
  reviews: 'reviews',
  carts: 'carts',
  orders: 'orders',
  sellerOrders: 'seller_orders',
  payments: 'payments',
  reservations: 'reservations',
  shipments: 'shipments',
  returns: 'returns',
  refunds: 'refunds',
  commissionPlans: 'commission_plans',
  sellerLedger: 'seller_ledger',
  payouts: 'payouts',
  platformSettings: 'platform_settings',
  notifications: 'notifications',
  backgroundJobs: 'background_jobs',
  supportNotes: 'support_notes',
  auditLogs: 'audit_logs',
  idempotencyRecords: 'idempotency_records',
  webhookEvents: 'webhook_events',
} as const;

export type CollectionName = keyof typeof COLLECTION_TABLES;

export function tableFor(collection: string): string {
  const table = COLLECTION_TABLES[collection as CollectionName];
  if (!table) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return table;
}

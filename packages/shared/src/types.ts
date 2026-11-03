import type { PlatformRole, SellerPermission, SellerRole } from './roles.js';
import type { SaAddress, SellerDocumentKind } from './schemas.js';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected';

export type ProductStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'archived';

export type SellerStatus = 'active' | 'suspended';

/** Chosen at registration — customers cannot open Seller Centre. */
export type AccountType = 'customer' | 'seller';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  /** Set once at registration. Missing = legacy (infer from memberships). */
  accountType?: AccountType;
  platformRoles: PlatformRole[];
  status: 'active' | 'suspended';
  createdAt?: string;
  updatedAt?: string;
}

export interface SellerDocumentRef {
  kind: SellerDocumentKind;
  path: string;
  fileName: string;
  contentType: string;
  uploadedAt?: string;
}

export interface SellerApplication {
  id: string;
  ownerUid: string;
  status: ApplicationStatus;
  businessName: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: SaAddress;
  documentRefs: SellerDocumentRef[];
  verificationChecklist: {
    businessDetailsComplete: boolean;
    documentsUploaded: boolean;
    agreementAccepted: boolean;
  };
  reviewerUid?: string;
  decisionReason?: string;
  sellerAgreementVersion: string;
  commissionPlanId?: string;
  paymentOnboardingState: 'not_started' | 'pending' | 'complete';
  createdAt?: string;
  submittedAt?: string;
  decidedAt?: string;
  updatedAt?: string;
}

/** Bank destination for seller withdrawals (Paystack Transfer / EFT). */
export interface SellerPayoutBank {
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchCode?: string;
}

export interface Seller {
  id: string;
  applicationId: string;
  ownerUid: string;
  businessName: string;
  status: SellerStatus;
  commissionPlanId: string;
  /** Where Nexle sends withdrawals after the 8% platform fee. */
  payoutBank?: SellerPayoutBank;
  createdAt?: string;
  updatedAt?: string;
}

export interface SellerMember {
  id: string;
  sellerId: string;
  uid: string;
  role: SellerRole;
  permissions: SellerPermission[];
  status: 'active' | 'revoked';
  createdAt?: string;
  updatedAt?: string;
}

/** Authenticated session payload from GET /v1/users/me */
export interface MeResponse extends UserProfile {
  sellerMemberships: SellerMember[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface ProductVariant {
  sku: string;
  title: string;
  priceCents: number;
  promotionalPriceCents?: number;
  attributes: Record<string, string>;
}

export interface ProductImage {
  path: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sortOrder: number;
}

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  categoryId: string;
  brand?: string;
  attributes: Record<string, string>;
  images: ProductImage[];
  status: ProductStatus;
  moderation?: {
    reviewerUid?: string;
    reason?: string;
    decidedAt?: string;
  };
  variants: ProductVariant[];
  taxClassification: string;
  handlingTimeDays: number;
  shippingDimensions?: {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    weightGrams: number;
  };
  /** Aggregated from published reviews; averageTimes100 e.g. 450 = 4.50 stars. */
  ratingSummary?: {
    averageTimes100: number;
    count: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryRecord {
  id: string;
  productId: string;
  sellerId: string;
  sku: string;
  quantityOnHand: number;
  quantityReserved: number;
  updatedAt?: string;
}

export interface Actor {
  uid: string;
  email: string;
  displayName: string;
  accountType?: AccountType;
  platformRoles: PlatformRole[];
  status: 'active' | 'suspended';
  sellerMemberships: SellerMember[];
}

export interface CartItem {
  productId: string;
  sellerId: string;
  sku: string;
  quantity: number;
  titleSnapshot: string;
}

export interface Cart {
  id: string;
  ownerUid?: string;
  guestToken?: string;
  items: CartItem[];
  updatedAt?: string;
  createdAt?: string;
}

export interface OrderLineSnapshot {
  productId: string;
  sellerId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  taxClassification: string;
  commissionRuleSnapshot: {
    planId: string;
    version: number;
    percentageBps: number;
    rounding: 'half_up';
  };
  platformCommissionCents: number;
  sellerProceedsCents: number;
}

export interface Order {
  id: string;
  customerUid: string;
  status: import('./orderStates.js').OrderStatus;
  currency: 'ZAR';
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  shippingAddress: SaAddress;
  lines: OrderLineSnapshot[];
  deliveryQuotes: Array<{
    sellerId: string;
    deliveryCents: number;
    serviceCode: string;
    estimateOnly: boolean;
  }>;
  paymentId?: string;
  reservationIds: string[];
  idempotencyKey: string;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
}

export interface SellerOrder {
  id: string;
  orderId: string;
  sellerId: string;
  status: import('./orderStates.js').SellerOrderStatus;
  lines: OrderLineSnapshot[];
  subtotalCents: number;
  deliveryCents: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentAttempt {
  id: string;
  orderId: string;
  provider: 'mock';
  providerRef: string;
  amountCents: number;
  currency: 'ZAR';
  status: import('./orderStates.js').PaymentStatus;
  idempotencyKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockReservation {
  id: string;
  orderId: string;
  inventoryId: string;
  productId: string;
  sellerId: string;
  sku: string;
  quantity: number;
  status: import('./orderStates.js').ReservationStatus;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerEntry {
  id: string;
  sellerId: string;
  type: import('./finance.js').LedgerEntryType;
  amountCents: number;
  sign: 1 | -1;
  bucket: import('./finance.js').LedgerBucket;
  currency: 'ZAR';
  orderId?: string;
  paymentId?: string;
  refundId?: string;
  payoutId?: string;
  compensatingForEntryId?: string;
  description: string;
  createdByUid: string;
  createdAt: string;
}

export interface RefundLine {
  productId: string;
  sellerId: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineRefundCents: number;
  platformCommissionCents: number;
  sellerProceedsCents: number;
}

export interface Refund {
  id: string;
  orderId: string;
  paymentId: string;
  customerUid: string;
  status: import('./finance.js').RefundStatus;
  lines: RefundLine[];
  amountCents: number;
  currency: 'ZAR';
  reasonCode: string;
  notes?: string;
  providerRefundRef?: string;
  idempotencyKey: string;
  reviewerUid?: string;
  decisionReason?: string;
  createdAt?: string;
  updatedAt?: string;
  succeededAt?: string;
}

export interface Payout {
  id: string;
  sellerId: string;
  amountCents: number;
  currency: 'ZAR';
  status: import('./finance.js').PayoutStatus;
  providerPayoutRef?: string;
  idempotencyKey: string;
  requestedByUid: string;
  reviewedByUid?: string;
  decisionReason?: string;
  /** Bank snapshot at request time — amount is already net of platform commission. */
  destinationBank?: SellerPayoutBank;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
}

export interface CommissionPlan {
  id: string;
  name: string;
  version: number;
  percentageBps: number;
  effectiveFrom: string;
  isDefault: boolean;
  previousPlanId?: string;
  createdAt?: string;
}

export interface ParcelDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGrams: number;
}

export interface Shipment {
  id: string;
  orderId: string;
  sellerOrderId: string;
  sellerId: string;
  customerUid: string;
  status: import('./fulfilment.js').ShipmentStatus;
  serviceCode: string;
  parcel: ParcelDimensions;
  rateCents?: number;
  rateEstimateOnly: boolean;
  rateExpiresAt?: string;
  provider: string;
  providerShipmentRef?: string;
  trackingNumber?: string;
  labelUrl?: string;
  trackingEvents: Array<{
    status: string;
    description: string;
    at: string;
    source: 'provider' | 'manual' | 'webhook';
  }>;
  exceptionCode?: string;
  exceptionNote?: string;
  idempotencyKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  customerUid: string;
  sellerId: string;
  status: import('./fulfilment.js').ReturnStatus;
  lines: Array<{
    productId: string;
    sku: string;
    quantity: number;
    title?: string;
  }>;
  reasonCode: string;
  notes?: string;
  evidencePaths: string[];
  returnShipmentId?: string;
  refundId?: string;
  inspectionOutcome?: 'accepted' | 'rejected';
  inspectionNotes?: string;
  reviewerUid?: string;
  decisionReason?: string;
  idempotencyKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationRecord {
  id: string;
  template: import('./fulfilment.js').NotificationTemplate;
  channel: import('./fulfilment.js').NotificationChannel;
  status: import('./fulfilment.js').NotificationStatus;
  toUid?: string;
  toEmail?: string;
  subject: string;
  body: string;
  vars: Record<string, string>;
  attempts: number;
  lastError?: string;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

export interface SupportNote {
  id: string;
  resourceType: 'order' | 'shipment' | 'return' | 'refund' | 'seller';
  resourceId: string;
  note: string;
  visibility: 'internal' | 'customer';
  authorUid: string;
  createdAt: string;
}

export interface BackgroundJob {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'dead_letter';
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

import { z } from 'zod';
import { PLATFORM_ROLES, SELLER_PERMISSIONS, SELLER_ROLES } from './roles.js';

export const saAddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  suburb: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  postalCode: z.string().regex(/^\d{4}$/),
  country: z.literal('ZA'),
  /** Precise map pin (WGS84). Optional for legacy addresses. */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type SaAddress = z.infer<typeof saAddressSchema>;

/** South African provinces for delivery / profile forms. */
export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const;

export const userStatusSchema = z.enum(['active', 'suspended']);

export const accountTypeSchema = z.enum(['customer', 'seller']);

const optionalPhone = z
  .string()
  .max(20)
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

export const createUserProfileSchema = z.object({
  displayName: z.string().min(1).max(120),
  phone: optionalPhone,
  /** Saved delivery / contact address (South Africa). */
  defaultShippingAddress: saAddressSchema.optional(),
  /** Required on first profile complete (registration); ignored if already set. */
  accountType: accountTypeSchema.optional(),
});

export const applicationStatusSchema = z.enum([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
]);

export const sellerDocumentKindSchema = z.enum([
  'cipc_registration',
  'director_id',
  'proof_of_address',
  'bank_confirmation',
  'signed_merchant_contract',
  'vat_certificate',
]);

export type SellerDocumentKind = z.infer<typeof sellerDocumentKindSchema>;

/** Required company documents before a seller application can be submitted. */
export const REQUIRED_SELLER_DOCUMENT_KINDS = [
  'cipc_registration',
  'director_id',
  'proof_of_address',
  'bank_confirmation',
  'signed_merchant_contract',
] as const satisfies readonly SellerDocumentKind[];

export const documentRefSchema = z.object({
  kind: sellerDocumentKindSchema,
  path: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  uploadedAt: z.string().datetime().optional(),
});

export const upsertSellerApplicationSchema = z.object({
  businessName: z.string().min(2).max(200),
  tradingName: z.string().max(200).optional(),
  registrationNumber: z.string().max(50).optional(),
  vatNumber: z.string().max(50).optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7).max(20),
  businessAddress: saAddressSchema,
  documentRefs: z.array(documentRefSchema).max(12).default([]),
  sellerAgreementVersion: z.string().min(1).max(40),
});

export const submitSellerApplicationSchema = z.object({
  applicationId: z.string().min(1),
});

export const reviewSellerApplicationSchema = z.object({
  applicationId: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(1000).optional(),
  commissionPlanId: z.string().min(1).optional(),
});

export const sellerPayoutBankSchema = z.object({
  accountName: z.string().min(2).max(120),
  bankName: z.string().min(2).max(120),
  accountNumber: z.string().regex(/^\d{6,16}$/, 'Account number must be 6–16 digits'),
  branchCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const updateSellerPayoutBankSchema = z.object({
  sellerId: z.string().min(1),
  payoutBank: sellerPayoutBankSchema,
});

export const productStatusSchema = z.enum([
  'draft',
  'pending_review',
  'active',
  'rejected',
  'archived',
]);

export const productVariantSchema = z.object({
  sku: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  priceCents: z.number().int().nonnegative(),
  promotionalPriceCents: z.number().int().nonnegative().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
});

export const productImageSchema = z.object({
  path: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const createProductSchema = z.object({
  sellerId: z.string().min(1),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  /** Optional — API assigns General when omitted. */
  categoryId: z.string().min(1).optional(),
  brand: z.string().max(100).optional(),
  attributes: z.record(z.string(), z.string()).default({}),
  images: z.array(productImageSchema).max(12).default([]),
  variants: z.array(productVariantSchema).min(1).max(50),
  taxClassification: z.string().min(1).max(40),
  handlingTimeDays: z.number().int().min(0).max(60),
  /** Starting stock for each variant (defaults to 10). */
  initialStock: z.number().int().nonnegative().max(100_000).optional().default(10),
  shippingDimensions: z
    .object({
      lengthCm: z.number().positive(),
      widthCm: z.number().positive(),
      heightCm: z.number().positive(),
      weightGrams: z.number().int().positive(),
    })
    .optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({ sellerId: true }).extend({
  productId: z.string().min(1),
});

export const submitProductForReviewSchema = z.object({
  productId: z.string().min(1),
});

export const moderateProductSchema = z.object({
  productId: z.string().min(1),
  decision: z.enum(['active', 'rejected']),
  reason: z.string().max(1000).optional(),
});

export const upsertCategorySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateInventorySchema = z.object({
  inventoryId: z.string().min(1),
  quantityOnHand: z.number().int().nonnegative(),
});

export const productSearchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  sellerId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['updated_desc', 'price_asc', 'price_desc']).default('updated_desc'),
});

export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export const sellerRoleSchema = z.enum(SELLER_ROLES);
export const sellerPermissionSchema = z.enum(SELLER_PERMISSIONS);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export const cartItemInputSchema = z.object({
  productId: z.string().min(1),
  sku: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(99),
});

export const updateCartItemSchema = z.object({
  productId: z.string().min(1),
  sku: z.string().min(1).max(64),
  quantity: z.number().int().min(0).max(99),
});

export const checkoutSchema = z.object({
  shippingAddress: saAddressSchema,
  idempotencyKey: z.string().min(8).max(120),
});

export const mockPaymentCompleteSchema = z.object({
  providerRef: z.string().min(1),
  outcome: z.enum(['succeeded', 'failed']).default('succeeded'),
});

/** Customer return-URL / client confirm — races provider webhook. */
export const confirmPaymentSchema = z.object({
  orderId: z.string().min(1),
});

export const createRefundRequestSchema = z.object({
  orderId: z.string().min(1),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        sku: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  reasonCode: z.enum([
    'changed_mind',
    'defective',
    'not_as_described',
    'wrong_item',
    'other',
  ]),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().min(8).max(120),
});

export const reviewRefundSchema = z.object({
  refundId: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(1000).optional(),
});

export const createPayoutSchema = z.object({
  sellerId: z.string().min(1),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(120),
});

export const reviewPayoutSchema = z.object({
  payoutId: z.string().min(1),
  decision: z.enum(['approve_and_initiate', 'hold', 'cancel']),
  reason: z.string().max(1000).optional(),
});

export const upsertCommissionPlanSchema = z.object({
  name: z.string().min(2).max(120),
  percentageBps: z.number().int().min(0).max(10_000),
  effectiveFrom: z.string().datetime(),
  isDefault: z.boolean().default(false),
  /** When set, creates a new version based on an existing plan family */
  previousPlanId: z.string().optional(),
});

export const releaseSellerEligibilitySchema = z.object({
  sellerId: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
});

export const parcelDimensionsSchema = z.object({
  lengthCm: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  weightGrams: z.number().int().positive(),
});

export const createShipmentSchema = z.object({
  sellerOrderId: z.string().min(1),
  serviceCode: z.string().min(1).max(40).default('MOCK_STANDARD'),
  parcel: parcelDimensionsSchema,
  idempotencyKey: z.string().min(8).max(120),
});

export const quoteShipmentSchema = z.object({
  sellerOrderId: z.string().min(1),
  parcel: parcelDimensionsSchema,
});

export const cancelShipmentSchema = z.object({
  shipmentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const manualTrackingSchema = z.object({
  shipmentId: z.string().min(1),
  status: z.enum([
    'in_transit',
    'out_for_delivery',
    'delivered',
    'failed_attempt',
    'exception',
    'returned_to_sender',
  ]),
  note: z.string().max(500).optional(),
  trackingNumber: z.string().max(80).optional(),
});

export const createReturnRequestSchema = z.object({
  orderId: z.string().min(1),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        sku: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  reasonCode: z.enum([
    'changed_mind',
    'defective',
    'not_as_described',
    'wrong_item',
    'other',
  ]),
  notes: z.string().max(2000).optional(),
  evidencePaths: z.array(z.string().min(1)).max(5).default([]),
  idempotencyKey: z.string().min(8).max(120),
});

export const reviewReturnSchema = z.object({
  returnId: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(1000).optional(),
});

export const inspectReturnSchema = z.object({
  returnId: z.string().min(1),
  outcome: z.enum(['accepted', 'rejected']),
  notes: z.string().max(2000).optional(),
  createRefund: z.boolean().default(true),
});

export const supportNoteSchema = z.object({
  resourceType: z.enum(['order', 'shipment', 'return', 'refund', 'seller']),
  resourceId: z.string().min(1),
  note: z.string().min(1).max(4000),
  visibility: z.enum(['internal', 'customer']).default('internal'),
});

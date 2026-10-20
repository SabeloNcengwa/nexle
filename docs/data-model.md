# Mavundla Marketplace — Data Model

Monetary amounts are stored as **integer cents** with currency **ZAR**. Never use floating-point for money.

Server timestamps (`FieldValue.serverTimestamp()`) are authoritative for create/update/decision events.

## Collections (Phase 1 implemented)

### `users/{uid}`

| Field | Type | Notes |
|-------|------|-------|
| uid | string | Firebase Auth UID |
| email | string | |
| displayName | string | |
| phone | string? | E.164 preferred |
| platformRoles | string[] | e.g. `support_agent`, `super_admin` — empty for customers |
| status | `active` \| `suspended` | |
| createdAt, updatedAt | timestamp | |

Ownership: document ID = Auth UID. Clients may read/update own non-privileged fields only; roles are server-only.

### `sellerApplications/{applicationId}`

Lifecycle: `draft` → `submitted` → `under_review` → `approved` | `rejected` (resubmit allowed after rejection).

| Field | Type | Notes |
|-------|------|-------|
| ownerUid | string | Applicant |
| status | enum | See lifecycle |
| businessName | string | |
| tradingName | string? | |
| registrationNumber | string? | CIPC / similar |
| vatNumber | string? | |
| contactEmail, contactPhone | string | |
| businessAddress | Address | SA address shape |
| documentRefs | DocumentRef[] | Storage paths, never public URLs |
| verificationChecklist | object | server-managed flags |
| reviewerUid | string? | |
| decisionReason | string? | |
| sellerAgreementVersion | string | |
| commissionPlanId | string? | Assigned on approval |
| paymentOnboardingState | `not_started` \| `pending` \| `complete` | Provider-side later |
| createdAt, submittedAt, decidedAt, updatedAt | timestamp | |

### `sellers/{sellerId}`

Created only on application approval.

| Field | Type | Notes |
|-------|------|-------|
| applicationId | string | |
| ownerUid | string | |
| businessName | string | |
| status | `active` \| `suspended` | |
| commissionPlanId | string | |
| createdAt, updatedAt | timestamp | |

### `sellerMembers/{memberId}`

| Field | Type | Notes |
|-------|------|-------|
| sellerId | string | |
| uid | string | |
| role | `seller_owner` \| `seller_manager` \| `seller_staff` | |
| permissions | string[] | Explicit grants |
| status | `active` \| `revoked` | |
| createdAt, updatedAt | timestamp | |

A user may be a customer and a seller member simultaneously.

### `categories/{categoryId}`

| Field | Type | Notes |
|-------|------|-------|
| name | string | |
| slug | string | unique |
| parentId | string \| null | |
| path | string[] | Ancestor IDs for queries |
| sortOrder | number | |
| isActive | boolean | |
| createdAt, updatedAt | timestamp | |

### `products/{productId}`

| Field | Type | Notes |
|-------|------|-------|
| sellerId | string | |
| title, description | string | |
| categoryId | string | |
| brand | string? | |
| attributes | Record<string, string> | Searchable attrs |
| images | ProductImage[] | Storage paths + metadata |
| status | `draft` \| `pending_review` \| `active` \| `rejected` \| `archived` | |
| moderation | { reviewerUid?, reason?, decidedAt? } | |
| variants | ProductVariant[] | SKU, priceCents, attributes — **display only**; stock lives in `inventory` |
| taxClassification | string | |
| handlingTimeDays | number | |
| shippingDimensions | object? | |
| createdAt, updatedAt | timestamp | |

Public search must exclude non-`active` products and products whose seller is not `active`.

### `inventory/{inventoryId}`

One record per purchasable seller SKU. Separate from public product copy.

| Field | Type | Notes |
|-------|------|-------|
| productId, sellerId, sku | string | |
| quantityOnHand | number | integer |
| quantityReserved | number | integer; reservation logic Phase 2 |
| updatedAt | timestamp | |

Phase 1 exposes read/update of stock for sellers; atomic reservation arrives in Phase 2.

## Collections (Phase 2)

### `carts/{cartId}`

IDs: `user_{uid}` or `guest_{guestToken}`.

| Field | Type | Notes |
|-------|------|-------|
| ownerUid | string? | Set for authenticated carts |
| guestToken | string? | Guest browser cart id |
| items | CartItem[] | Max 50; productId, sellerId, sku, quantity, titleSnapshot |
| createdAt, updatedAt | string (ISO) | |

Prices are **not** trusted from the cart — recalculated at checkout.

### `orders/{orderId}`

| Field | Type | Notes |
|-------|------|-------|
| customerUid | string | |
| status | pending_payment \| paid \| payment_failed \| cancelled \| expired | |
| currency | `ZAR` | |
| subtotalCents, deliveryCents, totalCents | int | |
| shippingAddress | SaAddress | |
| lines | OrderLineSnapshot[] | Immutable snapshots incl. commission rule |
| deliveryQuotes | per-seller estimates | `estimateOnly: true` for mock |
| paymentId | string | |
| reservationIds | string[] | |
| sellerOrderIds | string[] | |
| idempotencyKey | string | |

### `sellerOrders/{sellerOrderId}`

One per seller in a multi-seller basket. Status: `awaiting_payment` → `confirmed` \| `cancelled`.

### `payments/{paymentId}`

| Field | Type | Notes |
|-------|------|-------|
| orderId | string | |
| provider | `mock` (Phase 2) | |
| providerRef | string | |
| amountCents, currency | int / ZAR | |
| status | created \| pending \| succeeded \| failed \| cancelled | |
| idempotencyKey | string | |

Client cannot set `status = succeeded`. Only verified provider webhooks / server verification.

### `reservations/{reservationId}`

Atomic stock holds. Status: `active` → `consumed` \| `released` \| `expired`. TTL 15 minutes.

### `webhookEvents/{eventId}` / `idempotencyRecords/{id}`

Append-only / claim records for safe retries.

## Collections (Phase 3)

### `sellerLedger/{entryId}`

Append-only. Corrections are compensating entries.

| Field | Type |
|-------|------|
| sellerId | string (`__platform__` for platform revenue rows) |
| type | seller_sale_proceeds, platform_commission, refund, payout, eligibility_release, … |
| amountCents | int ≥ 0 |
| sign | +1 credit / -1 debit |
| bucket | pending \| eligible \| held \| paid |
| orderId / paymentId / refundId / payoutId | optional refs |
| createdByUid, createdAt | |

### `refunds/{refundId}`

Statuses: requested → under_review → approved → provider_pending → succeeded \| failed.

Provider acceptance alone does **not** mark `succeeded`.

### `payouts/{payoutId}`

Statuses: pending_eligibility, eligible, processing, paid, on_hold, failed, reversed, cancelled.

Only verified provider outcomes (or controlled reconciliation) mark `paid`.

### `platformSettings/finance`

Optional: `returnWindowDays`, `payoutHoldDays`, `minPayoutCents`.

## Collections (Phase 4)

### `shipments/{shipmentId}`

Statuses: draft → rate_quoted → booked → in_transit → … → delivered / exception / cancelled.

`rateEstimateOnly` distinguishes quotes from confirmed bookings. Tracking events append with `source: provider | webhook | manual`.

### `returns/{returnId}`

Physical return requests (separate from financial `refunds`). May create `returnShipmentId` and later `refundId`.

### `notifications/{id}` + `backgroundJobs/{id}`

Durable async notifications. Payment/order state must not depend on delivery success.

### `supportNotes/{id}`

Support annotations; `visibility: internal | customer`.

## Collections (Phase 6)

### `reviews/{reviewId}`

| Field | Type | Notes |
|-------|------|-------|
| productId, sellerId, orderId | string | Verified purchase |
| authorUid, authorDisplayName | string | |
| rating | number | 1–5 integer |
| title, body | string | |
| status | `published` \| `hidden` \| `rejected` | |
| moderation | object | optional |
| createdAt, updatedAt | string | ISO |

API writes only. Product docs may store `ratingSummary: { averageTimes100, count }`.

Schemas for earlier stubs:

### `auditLogs/{logId}` (append-only, Phase 1 stub)

| Field | Type |
|-------|------|
| actorUid | string |
| action | string |
| resourceType, resourceId | string |
| metadata | object |
| createdAt | timestamp |

Client writes denied. Server-only.

### `commissionPlans/{planId}` (seed / admin, Phase 1 minimal)

| Field | Type |
|-------|------|
| name | string |
| version | number |
| percentageBps | number | basis points (e.g. 1000 = 10%) |
| effectiveFrom | timestamp |
| isDefault | boolean |

## Address shape (South Africa)

```ts
{
  line1: string;
  line2?: string;
  suburb: string;
  city: string;
  province: string; // e.g. Gauteng
  postalCode: string;
  country: "ZA";
}
```

## Identifiers

- Prefer Firestore auto-IDs or stable slugs (`categories.slug`).
- `users` document ID = Auth UID.
- Avoid unbounded arrays; keep `variants` and `images` bounded (enforce max lengths in Zod).

## Pagination

Cursor-based (`startAfter` / `limit`) for list endpoints. Do not use offset pagination for large collections.

## Indexes

See `firebase/firestore.indexes.json`. Notable composites:

- `products`: `status` + `categoryId` + `updatedAt`
- `products`: `sellerId` + `status` + `updatedAt`
- `sellerApplications`: `ownerUid` + `updatedAt`
- `sellerApplications`: `status` + `submittedAt`
- `sellerMembers`: `uid` + `status`
- `sellerMembers`: `sellerId` + `status`

## Retention

- `auditLogs`: retain ≥ 7 years operationally (configure export/archive).
- Verification documents: retain per legal advice; delete only via controlled admin workflow.
- Soft-delete / archive products rather than hard-delete when orders may reference snapshots (Phase 2+).

## Migrations

1. Add new fields as optional with server defaults.
2. Backfill via Admin scripts under `scripts/`.
3. Document each migration in `docs/migrations/` when introduced.
4. Never rewrite historical ledger rows (Phase 3); use compensating entries.

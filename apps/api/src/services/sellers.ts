import {
  DEFAULT_PERMISSIONS_BY_ROLE,
  reviewSellerApplicationSchema,
  submitSellerApplicationSchema,
  upsertSellerApplicationSchema,
  type Seller,
  type SellerApplication,
} from '@mavundla/shared';
import type { Actor } from '@mavundla/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { writeAuditLog } from './audit.js';

function mapApplication(id: string, data: FirebaseFirestore.DocumentData): SellerApplication {
  return {
    id,
    ownerUid: String(data.ownerUid),
    status: data.status,
    businessName: String(data.businessName),
    tradingName: data.tradingName,
    registrationNumber: data.registrationNumber,
    vatNumber: data.vatNumber,
    contactEmail: String(data.contactEmail),
    contactPhone: String(data.contactPhone),
    businessAddress: data.businessAddress,
    documentRefs: data.documentRefs ?? [],
    verificationChecklist: data.verificationChecklist ?? {
      businessDetailsComplete: false,
      documentsUploaded: false,
      agreementAccepted: false,
    },
    reviewerUid: data.reviewerUid,
    decisionReason: data.decisionReason,
    sellerAgreementVersion: String(data.sellerAgreementVersion),
    commissionPlanId: data.commissionPlanId,
    paymentOnboardingState: data.paymentOnboardingState ?? 'not_started',
    createdAt: data.createdAt,
    submittedAt: data.submittedAt,
    decidedAt: data.decidedAt,
    updatedAt: data.updatedAt,
  };
}

export async function createOrUpdateDraftApplication(
  actor: Actor | undefined,
  body: unknown,
  applicationId?: string,
): Promise<SellerApplication> {
  requireAuthenticatedUser(actor);
  const input = upsertSellerApplicationSchema.parse(body);
  const now = new Date().toISOString();

  const checklist = {
    businessDetailsComplete: Boolean(input.businessName && input.contactEmail && input.businessAddress),
    documentsUploaded: input.documentRefs.length > 0,
    agreementAccepted: Boolean(input.sellerAgreementVersion),
  };

  if (applicationId) {
    const ref = db().collection('sellerApplications').doc(applicationId);
    const snap = await ref.get();
    if (!snap.exists) throw new AppError('NOT_FOUND', 'Application not found', 404);
    const existing = snap.data()!;
    if (existing.ownerUid !== actor.uid) {
      throw new AppError('FORBIDDEN', 'Not your application', 403);
    }
    if (!['draft', 'rejected'].includes(existing.status)) {
      throw new AppError('INVALID_STATE', 'Application cannot be edited in current status', 409);
    }
    await ref.update({
      ...input,
      status: 'draft',
      verificationChecklist: checklist,
      updatedAt: now,
      decisionReason: FieldValue.delete(),
      reviewerUid: FieldValue.delete(),
      decidedAt: FieldValue.delete(),
    });
    const updated = await ref.get();
    return mapApplication(ref.id, updated.data()!);
  }

  const ref = db().collection('sellerApplications').doc();
  const doc = {
    ownerUid: actor.uid,
    status: 'draft',
    ...input,
    verificationChecklist: checklist,
    paymentOnboardingState: 'not_started',
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  return mapApplication(ref.id, doc);
}

export async function submitApplication(
  actor: Actor | undefined,
  body: unknown,
): Promise<SellerApplication> {
  requireAuthenticatedUser(actor);
  const { applicationId } = submitSellerApplicationSchema.parse(body);
  const ref = db().collection('sellerApplications').doc(applicationId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Application not found', 404);
  const data = snap.data()!;
  if (data.ownerUid !== actor.uid) {
    throw new AppError('FORBIDDEN', 'Not your application', 403);
  }
  if (!['draft', 'rejected'].includes(data.status)) {
    throw new AppError('INVALID_STATE', 'Only draft or rejected applications can be submitted', 409);
  }
  const checklist = data.verificationChecklist ?? {};
  if (!checklist.businessDetailsComplete || !checklist.agreementAccepted) {
    throw new AppError('INCOMPLETE', 'Complete business details and agreement before submitting', 400);
  }

  const now = new Date().toISOString();
  await ref.update({
    status: 'submitted',
    submittedAt: now,
    updatedAt: now,
  });
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'seller_application.submitted',
    resourceType: 'sellerApplications',
    resourceId: applicationId,
  });
  const updated = await ref.get();
  return mapApplication(ref.id, updated.data()!);
}

export async function listMyApplications(actor: Actor | undefined): Promise<SellerApplication[]> {
  requireAuthenticatedUser(actor);
  const snap = await db()
    .collection('sellerApplications')
    .where('ownerUid', '==', actor.uid)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => mapApplication(d.id, d.data()));
}

export async function listApplicationsForReview(
  actor: Actor | undefined,
  status?: string,
): Promise<SellerApplication[]> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent', 'catalogue_moderator']);
  let query: FirebaseFirestore.Query = db().collection('sellerApplications');
  if (status) {
    query = query.where('status', '==', status);
  } else {
    query = query.where('status', 'in', ['submitted', 'under_review']);
  }
  const snap = await query.orderBy('submittedAt', 'desc').limit(50).get();
  return snap.docs.map((d) => mapApplication(d.id, d.data()));
}

export async function startReview(
  actor: Actor | undefined,
  applicationId: string,
): Promise<SellerApplication> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent', 'catalogue_moderator']);
  const ref = db().collection('sellerApplications').doc(applicationId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Application not found', 404);
  if (snap.data()!.status !== 'submitted') {
    throw new AppError('INVALID_STATE', 'Application is not in submitted status', 409);
  }
  const now = new Date().toISOString();
  await ref.update({
    status: 'under_review',
    reviewerUid: actor.uid,
    updatedAt: now,
  });
  const updated = await ref.get();
  return mapApplication(ref.id, updated.data()!);
}

export async function reviewApplication(
  actor: Actor | undefined,
  body: unknown,
): Promise<{ application: SellerApplication; seller?: Seller }> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent', 'catalogue_moderator']);
  const input = reviewSellerApplicationSchema.parse(body);
  const ref = db().collection('sellerApplications').doc(input.applicationId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Application not found', 404);
  const data = snap.data()!;
  if (!['submitted', 'under_review'].includes(data.status)) {
    throw new AppError('INVALID_STATE', 'Application cannot be decided in current status', 409);
  }

  const now = new Date().toISOString();

  if (input.decision === 'rejected') {
    await ref.update({
      status: 'rejected',
      reviewerUid: actor.uid,
      decisionReason: input.reason ?? 'Rejected',
      decidedAt: now,
      updatedAt: now,
    });
    await writeAuditLog({
      actorUid: actor.uid,
      action: 'seller_application.rejected',
      resourceType: 'sellerApplications',
      resourceId: input.applicationId,
      metadata: { reason: input.reason },
    });
    const updated = await ref.get();
    return { application: mapApplication(ref.id, updated.data()!) };
  }

  const planId = input.commissionPlanId ?? (await ensureDefaultCommissionPlan());
  const sellerRef = db().collection('sellers').doc();
  const memberId = `${data.ownerUid}_${sellerRef.id}`;

  const batch = db().batch();
  batch.update(ref, {
    status: 'approved',
    reviewerUid: actor.uid,
    decisionReason: input.reason ?? 'Approved',
    commissionPlanId: planId,
    decidedAt: now,
    updatedAt: now,
  });

  const sellerDoc = {
    applicationId: ref.id,
    ownerUid: data.ownerUid,
    businessName: data.businessName,
    status: 'active',
    commissionPlanId: planId,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(sellerRef, sellerDoc);

  batch.set(db().collection('sellerMembers').doc(memberId), {
    sellerId: sellerRef.id,
    uid: data.ownerUid,
    role: 'seller_owner',
    permissions: DEFAULT_PERMISSIONS_BY_ROLE.seller_owner,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  await batch.commit();
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'seller_application.approved',
    resourceType: 'sellers',
    resourceId: sellerRef.id,
    metadata: { applicationId: ref.id },
  });

  const updated = await ref.get();
  return {
    application: mapApplication(ref.id, updated.data()!),
    seller: { id: sellerRef.id, ...sellerDoc } as Seller,
  };
}

export async function setSellerStatus(
  actor: Actor | undefined,
  sellerId: string,
  status: 'active' | 'suspended',
): Promise<Seller> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent']);
  const ref = db().collection('sellers').doc(sellerId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Seller not found', 404);
  const now = new Date().toISOString();
  await ref.update({ status, updatedAt: now });
  await writeAuditLog({
    actorUid: actor.uid,
    action: status === 'suspended' ? 'seller.suspended' : 'seller.reactivated',
    resourceType: 'sellers',
    resourceId: sellerId,
  });
  const updated = await ref.get();
  const data = updated.data()!;
  return {
    id: sellerId,
    applicationId: data.applicationId,
    ownerUid: data.ownerUid,
    businessName: data.businessName,
    status: data.status,
    commissionPlanId: data.commissionPlanId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getSeller(sellerId: string): Promise<Seller> {
  const snap = await db().collection('sellers').doc(sellerId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Seller not found', 404);
  const data = snap.data()!;
  return {
    id: sellerId,
    applicationId: data.applicationId,
    ownerUid: data.ownerUid,
    businessName: data.businessName,
    status: data.status,
    commissionPlanId: data.commissionPlanId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

async function ensureDefaultCommissionPlan(): Promise<string> {
  const existing = await db()
    .collection('commissionPlans')
    .where('isDefault', '==', true)
    .limit(1)
    .get();
  if (!existing.empty) {
    return existing.docs[0]!.id;
  }
  const ref = db().collection('commissionPlans').doc();
  await ref.set({
    name: 'Standard 10%',
    version: 1,
    percentageBps: 1000,
    effectiveFrom: new Date().toISOString(),
    isDefault: true,
  });
  return ref.id;
}

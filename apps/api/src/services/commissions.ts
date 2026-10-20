import { upsertCommissionPlanSchema, type Actor, type CommissionPlan } from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import { requirePlatformPermission } from '../permissions/helpers.js';
import { writeAuditLog } from './audit.js';

function mapPlan(id: string, data: FirebaseFirestore.DocumentData): CommissionPlan {
  return {
    id,
    name: String(data.name),
    version: Number(data.version ?? 1),
    percentageBps: Number(data.percentageBps),
    effectiveFrom: String(data.effectiveFrom),
    isDefault: Boolean(data.isDefault),
    previousPlanId: data.previousPlanId,
    createdAt: data.createdAt,
  };
}

export async function listCommissionPlans(actor: Actor | undefined): Promise<CommissionPlan[]> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const snap = await db().collection('commissionPlans').orderBy('effectiveFrom', 'desc').limit(100).get();
  return snap.docs.map((d) => mapPlan(d.id, d.data()));
}

/** Create a new plan or a new immutable version — never rewrite history. */
export async function createCommissionPlan(
  actor: Actor | undefined,
  body: unknown,
): Promise<CommissionPlan> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const input = upsertCommissionPlanSchema.parse(body);
  const now = new Date().toISOString();

  let version = 1;
  if (input.previousPlanId) {
    const prev = await db().collection('commissionPlans').doc(input.previousPlanId).get();
    if (!prev.exists) throw new AppError('NOT_FOUND', 'Previous plan not found', 404);
    version = Number(prev.data()!.version ?? 1) + 1;
  }

  if (input.isDefault) {
    const defaults = await db().collection('commissionPlans').where('isDefault', '==', true).get();
    const batch = db().batch();
    for (const doc of defaults.docs) {
      batch.update(doc.ref, { isDefault: false });
    }
    await batch.commit();
  }

  const ref = db().collection('commissionPlans').doc();
  const doc = {
    name: input.name,
    version,
    percentageBps: input.percentageBps,
    effectiveFrom: input.effectiveFrom,
    isDefault: input.isDefault,
    previousPlanId: input.previousPlanId,
    createdAt: now,
  };
  await ref.set(doc);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'commission_plan.created',
    resourceType: 'commissionPlans',
    resourceId: ref.id,
    metadata: { version, percentageBps: input.percentageBps },
  });
  return mapPlan(ref.id, doc);
}

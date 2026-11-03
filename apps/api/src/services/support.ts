import { supportNoteSchema, type Actor, type SupportNote } from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  hasPlatformRole,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { writeAuditLog } from './audit.js';
import { enqueueNotification } from './notifications.js';
import { listExceptionShipments } from './shipments.js';
import { listReturnQueue } from './returns.js';
import { listRefundQueue } from './refunds.js';

function mapNote(id: string, data: DocData): SupportNote {
  return {
    id,
    resourceType: data.resourceType,
    resourceId: String(data.resourceId),
    note: String(data.note),
    visibility: data.visibility,
    authorUid: String(data.authorUid),
    createdAt: String(data.createdAt),
  };
}

export async function addSupportNote(
  actor: Actor | undefined,
  body: unknown,
): Promise<SupportNote> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent']);
  const input = supportNoteSchema.parse(body);
  const now = new Date().toISOString();
  const ref = db().collection('supportNotes').doc();
  const doc = {
    ...input,
    authorUid: actor.uid,
    createdAt: now,
  };
  await ref.set(doc);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'support.note_added',
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });

  if (input.visibility === 'customer') {
    let toUid: string | undefined;
    if (input.resourceType === 'order') {
      const order = await db().collection('orders').doc(input.resourceId).get();
      toUid = order.data()?.customerUid;
    } else if (input.resourceType === 'return') {
      const ret = await db().collection('returns').doc(input.resourceId).get();
      toUid = ret.data()?.customerUid;
    } else if (input.resourceType === 'shipment') {
      const ship = await db().collection('shipments').doc(input.resourceId).get();
      toUid = ship.data()?.customerUid;
    }
    if (toUid) {
      await enqueueNotification({
        template: 'support_update',
        toUid,
        vars: {
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          summary: input.note.slice(0, 200),
        },
        dedupeKey: `support_note_${ref.id}`,
      }).catch(() => undefined);
    }
  }

  return mapNote(ref.id, doc);
}

export async function listSupportNotes(
  actor: Actor | undefined,
  resourceType: string,
  resourceId: string,
): Promise<SupportNote[]> {
  requireAuthenticatedUser(actor);
  const snap = await db()
    .collection('supportNotes')
    .where('resourceType', '==', resourceType)
    .where('resourceId', '==', resourceId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const notes = snap.docs.map((d) => mapNote(d.id, d.data()));
  if (hasPlatformRole(actor, ['super_admin', 'support_agent'])) {
    return notes;
  }
  return notes.filter((n) => n.visibility === 'customer');
}

export async function getSupportDashboard(actor: Actor | undefined) {
  requirePlatformPermission(actor, ['super_admin', 'support_agent']);
  const [exceptions, returns, refunds] = await Promise.all([
    listExceptionShipments(actor),
    listReturnQueue(actor),
    listRefundQueue(actor),
  ]);
  return {
    exceptionShipments: exceptions,
    openReturns: returns,
    openRefunds: refunds,
  };
}

export async function lookupOrderForSupport(actor: Actor | undefined, orderId: string) {
  requirePlatformPermission(actor, ['super_admin', 'support_agent']);
  const order = await db().collection('orders').doc(orderId).get();
  if (!order.exists) throw new AppError('NOT_FOUND', 'Order not found', 404);
  const [shipments, returns, refunds, notes] = await Promise.all([
    db().collection('shipments').where('orderId', '==', orderId).get(),
    db().collection('returns').where('orderId', '==', orderId).get(),
    db().collection('refunds').where('orderId', '==', orderId).get(),
    db()
      .collection('supportNotes')
      .where('resourceType', '==', 'order')
      .where('resourceId', '==', orderId)
      .get(),
  ]);
  return {
    order: { id: order.id, ...order.data() },
    shipments: shipments.docs.map((d) => ({ id: d.id, ...d.data() })),
    returns: returns.docs.map((d) => ({ id: d.id, ...d.data() })),
    refunds: refunds.docs.map((d) => ({ id: d.id, ...d.data() })),
    notes: notes.docs.map((d) => mapNote(d.id, d.data())),
  };
}

import {
  renderNotificationBody,
  renderNotificationSubject,
  type NotificationChannel,
  type NotificationRecord,
  type NotificationTemplate,
} from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import { getEmailProvider, getSmsProvider } from '../providers/notifications/index.js';

const MAX_ATTEMPTS = 5;

function mapNotification(id: string, data: DocData): NotificationRecord {
  return {
    id,
    template: data.template,
    channel: data.channel,
    status: data.status,
    toUid: data.toUid,
    toEmail: data.toEmail,
    subject: String(data.subject),
    body: String(data.body),
    vars: data.vars ?? {},
    attempts: Number(data.attempts ?? 0),
    lastError: data.lastError,
    dedupeKey: String(data.dedupeKey),
    createdAt: String(data.createdAt),
    updatedAt: String(data.updatedAt),
    sentAt: data.sentAt,
  };
}

/** Enqueue notification as a durable job. Failures must not affect payment/order state. */
export async function enqueueNotification(input: {
  template: NotificationTemplate;
  channel?: NotificationChannel;
  toUid?: string;
  toEmail?: string;
  vars: Record<string, string>;
  dedupeKey: string;
}): Promise<NotificationRecord | null> {
  const existing = await db()
    .collection('notifications')
    .where('dedupeKey', '==', input.dedupeKey)
    .limit(1)
    .get();
  if (!existing.empty) {
    return mapNotification(existing.docs[0]!.id, existing.docs[0]!.data());
  }

  const now = new Date().toISOString();
  const channel = input.channel ?? 'email';
  const subject = renderNotificationSubject(input.template, input.vars);
  const body = renderNotificationBody(input.template, {
    summary: subject,
    ...input.vars,
  });

  const notifRef = db().collection('notifications').doc();
  const jobRef = db().collection('backgroundJobs').doc();

  const notif = {
    template: input.template,
    channel,
    status: 'pending',
    toUid: input.toUid,
    toEmail: input.toEmail,
    subject,
    body,
    vars: input.vars,
    attempts: 0,
    dedupeKey: input.dedupeKey,
    createdAt: now,
    updatedAt: now,
  };

  const batch = db().batch();
  batch.set(notifRef, notif);
  batch.set(jobRef, {
    type: 'send_notification',
    status: 'pending',
    payload: { notificationId: notifRef.id },
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();
  return mapNotification(notifRef.id, notif);
}

async function resolveDestination(
  notification: NotificationRecord,
): Promise<{ email?: string; phone?: string }> {
  if (notification.toEmail) {
    return notification.channel === 'sms'
      ? { phone: notification.toEmail }
      : { email: notification.toEmail };
  }
  if (!notification.toUid) return {};
  const user = await db().collection('users').doc(notification.toUid).get();
  if (!user.exists) return {};
  const data = user.data()!;
  return {
    email: data.email ? String(data.email) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
  };
}

/** Deliver via configured email/SMS providers. Failures stay inside the job worker. */
async function deliverNotification(notification: NotificationRecord): Promise<void> {
  const dest = await resolveDestination(notification);

  if (notification.channel === 'sms') {
    const to = dest.phone ?? dest.email;
    if (!to) throw new Error('SMS notification missing destination');
    await getSmsProvider().send({
      to,
      body: notification.body,
      notificationId: notification.id,
      template: notification.template,
    });
    return;
  }

  const to = dest.email;
  if (!to) throw new Error('Email notification missing destination');
  await getEmailProvider().send({
    to,
    subject: notification.subject,
    body: notification.body,
    notificationId: notification.id,
    template: notification.template,
  });
}

export async function processNotificationJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  const now = new Date().toISOString();
  const snap = await db()
    .collection('backgroundJobs')
    .where('type', '==', 'send_notification')
    .where('status', '==', 'pending')
    .where('runAfter', '<=', now)
    .limit(limit)
    .get();

  let processed = 0;
  let failed = 0;

  for (const jobDoc of snap.docs) {
    const job = jobDoc.data();
    const notificationId = String(job.payload?.notificationId ?? '');
    const notifRef = db().collection('notifications').doc(notificationId);
    const notifSnap = await notifRef.get();
    if (!notifSnap.exists) {
      await jobDoc.ref.update({
        status: 'failed',
        lastError: 'notification missing',
        updatedAt: now,
      });
      failed += 1;
      continue;
    }

    const notification = mapNotification(notifSnap.id, notifSnap.data()!);
    if (notification.status === 'sent') {
      await jobDoc.ref.update({ status: 'succeeded', updatedAt: now });
      processed += 1;
      continue;
    }

    try {
      await jobDoc.ref.update({ status: 'processing', updatedAt: now });
      await deliverNotification(notification);
      await notifRef.update({
        status: 'sent',
        attempts: notification.attempts + 1,
        sentAt: now,
        updatedAt: now,
      });
      await jobDoc.ref.update({ status: 'succeeded', updatedAt: now, attempts: job.attempts + 1 });
      processed += 1;
    } catch (err) {
      const attempts = Number(job.attempts ?? 0) + 1;
      const maxAttempts = Number(job.maxAttempts ?? MAX_ATTEMPTS);
      const message = err instanceof Error ? err.message : String(err);
      const dead = attempts >= maxAttempts;
      await notifRef.update({
        status: dead ? 'dead_letter' : 'failed',
        attempts: notification.attempts + 1,
        lastError: message,
        updatedAt: now,
      });
      await jobDoc.ref.update({
        status: dead ? 'dead_letter' : 'pending',
        attempts,
        lastError: message,
        runAfter: new Date(Date.now() + attempts * 60_000).toISOString(),
        updatedAt: now,
      });
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function listNotificationsForUser(
  uid: string,
  limit = 50,
): Promise<NotificationRecord[]> {
  const snap = await db()
    .collection('notifications')
    .where('toUid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => mapNotification(d.id, d.data()));
}

export async function getNotification(id: string): Promise<NotificationRecord> {
  const snap = await db().collection('notifications').doc(id).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Notification not found', 404);
  return mapNotification(snap.id, snap.data()!);
}

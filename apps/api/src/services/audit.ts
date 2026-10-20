import { db } from '../config/firebase.js';

export async function writeAuditLog(input: {
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db()
    .collection('auditLogs')
    .add({
      ...input,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    });
}

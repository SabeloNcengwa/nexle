/**
 * Firestore security rules tests.
 * Requires Firebase Emulator Suite (Firestore) running, or @firebase/rules-unit-testing
 * will start against FIRESTORE_EMULATOR_HOST.
 *
 * Run: npm run test:rules -w @mavundla/api
 * Prefer: firebase emulators:exec --only firestore "npm run test:rules -w @mavundla/api"
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-mavundla-rules';
const rules = readFileSync(resolve(process.cwd(), '../../firebase/firestore.rules'), 'utf8');

describe('firestore.rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085';
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('denies unauthenticated user profile read', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/u1').set({
        uid: 'u1',
        email: 'a@b.com',
        displayName: 'A',
        platformRoles: [],
        status: 'active',
      });
    });
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(unauthed.firestore().doc('users/u1').get());
  });

  it('allows owner to read own profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/u1').set({
        uid: 'u1',
        email: 'a@b.com',
        displayName: 'A',
        platformRoles: [],
        status: 'active',
      });
    });
    const user = testEnv.authenticatedContext('u1');
    await assertSucceeds(user.firestore().doc('users/u1').get());
  });

  it('prevents client from escalating platformRoles', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/u1').set({
        uid: 'u1',
        email: 'a@b.com',
        displayName: 'A',
        platformRoles: [],
        status: 'active',
      });
    });
    const user = testEnv.authenticatedContext('u1');
    await assertFails(
      user.firestore().doc('users/u1').update({
        platformRoles: ['super_admin'],
        displayName: 'Hacker',
      }),
    );
  });

  it('allows public read of active products only', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('products/p1').set({
        sellerId: 's1',
        title: 'Active',
        status: 'active',
      });
      await ctx.firestore().doc('products/p2').set({
        sellerId: 's1',
        title: 'Draft',
        status: 'draft',
      });
    });
    const unauthed = testEnv.unauthenticatedContext();
    await assertSucceeds(unauthed.firestore().doc('products/p1').get());
    await assertFails(unauthed.firestore().doc('products/p2').get());
  });

  it('denies client writes to auditLogs', async () => {
    const user = testEnv.authenticatedContext('u1');
    await assertFails(
      user.firestore().collection('auditLogs').add({
        action: 'fake',
        actorUid: 'u1',
      }),
    );
  });
});

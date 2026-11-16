/**
 * Phase 0 Security Rules Verification Suite (Dirty Dozen Payloads)
 * Verifies that all 12 adversarial payloads fail against firestore.rules.
 * Designed for execution with @firebase/rules-unit-testing against Firestore Emulator.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  collection: string;
  docId?: string;
  authUid: string | null;
  emailVerified?: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated List on menuItems',
    operation: 'list',
    collection: 'menuItems',
    authUid: null,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-Tenant Get on vendors',
    operation: 'get',
    collection: 'vendors',
    docId: 'vendor_owned_by_user_a',
    authUid: 'user_b',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unfiltered List Query on ledgerEntries',
    operation: 'list',
    collection: 'ledgerEntries',
    authUid: 'user_b',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity Spoofing on Create menuItems',
    operation: 'create',
    collection: 'menuItems',
    docId: 'item_spoof',
    authUid: 'attacker_uid',
    emailVerified: true,
    payload: { ownerId: 'victim_uid', name: 'Masala Dosa' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unverified Email Write on plannerTasks',
    operation: 'create',
    collection: 'plannerTasks',
    docId: 'task_unverified',
    authUid: 'user_a',
    emailVerified: false,
    payload: { ownerId: 'user_a', title: 'Grind Idli Batter' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow Update with Ghost Field',
    operation: 'update',
    collection: 'menuItems',
    docId: 'item_1',
    authUid: 'user_a',
    emailVerified: true,
    payload: { sellingPrice: 140, isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Timestamp Forgery on Create ledgerEntries',
    operation: 'create',
    collection: 'ledgerEntries',
    docId: 'entry_forged_time',
    authUid: 'user_a',
    emailVerified: true,
    payload: { ownerId: 'user_a', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable ownerId Mutation on Update vendors',
    operation: 'update',
    collection: 'vendors',
    docId: 'vendor_1',
    authUid: 'user_a',
    emailVerified: true,
    payload: { ownerId: 'user_b' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal State Reopen on completed plannerTask',
    operation: 'update',
    collection: 'plannerTasks',
    docId: 'task_completed',
    authUid: 'user_a',
    emailVerified: true,
    payload: { status: 'planned' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning with Invalid Characters',
    operation: 'create',
    collection: 'menuItems',
    docId: 'bad$doc#id!' + 'x'.repeat(200),
    authUid: 'user_a',
    emailVerified: true,
    payload: { ownerId: 'user_a', name: 'Idli' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Array Exhaustion Exceeding 20 Ingredients',
    operation: 'create',
    collection: 'menuItems',
    docId: 'item_huge_array',
    authUid: 'user_a',
    emailVerified: true,
    payload: {
      ownerId: 'user_a',
      ingredients: Array.from({ length: 25 }, (_, i) => ({ name: `Ing ${i}`, cost: 2 })),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Negative Amount Poisoning on ledgerEntries',
    operation: 'create',
    collection: 'ledgerEntries',
    docId: 'entry_negative',
    authUid: 'user_a',
    emailVerified: true,
    payload: { ownerId: 'user_a', amount: -500 },
    expectedResult: 'PERMISSION_DENIED',
  },
];

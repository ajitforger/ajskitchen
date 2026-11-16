# Security Specification — Dakshin Ledger

## 1. Data Invariants

1. **Tenant Isolation**: Every document in `menuItems`, `vendors`, `ledgerEntries`, `plannerTasks`, and `calcScenarios` MUST carry an immutable `ownerId` strictly equal to `request.auth.uid`. No user can read, list, update, or delete another user's restaurant records.
2. **PII & Profile Isolation**: `/users/{userId}` documents contain owner profile data (`ownerName`, `restaurantName`). Only `request.auth.uid == userId` may `get`, `create`, or `update` their own profile. Blanket `list` on `/users` is strictly denied.
3. **Verified Identity & Temporal Integrity**: All write operations require `request.auth != null` and `request.auth.token.email_verified == true`. Both `createdAt` (on create) and `updatedAt` (on create and update) must equal `request.time`. `createdAt` is immutable on update.
4. **Strict Schema & Bounds**: Every document enforces exact `hasAll` + `hasOnly` key allowlists, string `.size()` bounds, numeric range bounds, enum membership, and bounded arrays (`ingredients.size() <= 20`).
5. **Terminal State Locking**:
   - `menuItems.status == 'archived'` cannot be updated further.
   - `vendors.status == 'archived'` cannot be updated further.
   - `ledgerEntries.status == 'voided'` cannot be updated further.
   - `plannerTasks.status == 'completed'` cannot be updated further.
6. **Path ID Hardening**: All document IDs on single-document operations must match `^[a-zA-Z0-9_\\-]+$` and length `1..128`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)

1. **Unauthenticated List**: `list` on `/menuItems` with `auth == null`.
2. **Cross-Tenant Read**: `get` on `/vendors/vendor_1` owned by `user_A` while signed in as `user_B`.
3. **Unfiltered Query Scrape**: `list` on `/ledgerEntries` without `where('ownerId', '==', auth.uid)`.
4. **Identity Spoofing on Create**: `create` on `/menuItems/item_1` with `ownerId: "victim_uid"` while signed in as `attacker_uid`.
5. **Unverified Email Write**: `create` on `/plannerTasks/task_1` with `email_verified: false`.
6. **Ghost Field / Shadow Update**: `update` on `/menuItems/item_1` adding `{ isAdmin: true }` or `{ shadowField: "hack" }`.
7. **Timestamp Forgery**: `create` on `/ledgerEntries/entry_1` with client-supplied `createdAt` instead of `request.time`.
8. **Immutable Owner Mutation**: `update` on `/vendors/vendor_1` attempting to change `ownerId`.
9. **Terminal State Reopen**: `update` on `/plannerTasks/task_1` where existing `status == 'completed'`, attempting to set `status: 'planned'`.
10. **ID Poisoning**: `create` on `/menuItems/` + 300-character document ID or invalid characters `bad$id`.
11. **Array Exhaustion**: `create` on `/menuItems/item_1` with `ingredients` array containing 25 elements (exceeds cap of 20).
12. **Negative / Poisoned Numeric Values**: `create` on `/ledgerEntries/entry_1` with `amount: -500` or string `"500"` instead of number.

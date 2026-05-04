# Security Specification for SmartList

## Data Invariants
1. A shopping list must have an owner and at least one member (the owner).
2. Items can only be added to a list that the user is a member of.
3. Users can only see lists they are members of.
4. `updatedAt` and `createdAt` must be server-side timestamps.
5. `name` fields must be size-constrained to prevent "Denial of Wallet" attacks.

## The Dirty Dozen Payloads (Rejection Tests)
1. **List Spoofing**: Creating a list where `ownerId` is not the current user.
2. **Access Breach**: Reading a list where the current user is not in the `members` array.
3. **Item Hijacking**: Adding an item to a list the user doesn't belong to.
4. **Massive Payload**: Sending a list name larger than 256 characters.
5. **Ghost Item**: Adding an item with a "isVerified" field not in the schema.
6. **Immutable Breach**: Attempting to change the `ownerId` of an existing list.
7. **Role Escalation**: Attempting to add oneself to a list's members without being an owner (if we had roles).
8. **Orphaned Write**: Adding an item to a list that does not exist.
9. **Timestamp Manipulation**: Providing a future timestamp for `updatedAt`.
10. **ID Poisoning**: Using a 2KB string as a list ID.
11. **State Skipping**: (Not applicable yet, maybe terminal statuses later).
12. **PII Leak**: (Not applicable as we don't store PII in this draft).

## Test Runner (Draft)
I will implement `firestore.rules.test.ts` to verify these.

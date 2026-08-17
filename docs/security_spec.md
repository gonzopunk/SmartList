# Security Specification for SmartList

## Data Invariants
1. A shopping list must have an owner and at least one member (the owner).
2. Items can only be added to a list that the user is a member of.
3. Users can only see lists they are members of, or lists that have already
   invited their email address (`pendingEmails`).
4. `updatedAt` and `createdAt` must be server-side timestamps.
5. `name` fields must be size-constrained to prevent "Denial of Wallet" attacks.
6. `ownerId` and `createdAt` are immutable after creation.

## Membership Model
A list's `members` array is the single authority on access. It changes through
exactly three sanctioned transitions, expressed as the three branches of the
`lists` update rule:

| Branch | Who | May change | Constraint |
| --- | --- | --- | --- |
| `isOwnerManagingList` | the owner | `name`, `members`, `pendingEmails` | cannot remove themselves |
| `isMemberInviting` | any other member | `name`, `members`, `pendingEmails` | additive only — cannot remove anyone |
| `isSelfJoining` | a non-member | `members`, `pendingEmails` | adds exactly themselves; clears at most their own pending invite |

Consequences worth being explicit about:

- **Share links are bearer tokens.** `isSelfJoining` lets any signed-in user who
  knows a list id add themselves. That is the whole point of the copy-link
  feature, and list ids are unguessable, but a leaked link is a leaked list.
  Removing that branch would disable link sharing entirely.
- **Non-members cannot read a list** (invariant 3), so redeeming a link involves
  a write before the first successful read. `joinListById` handles the expected
  `permission-denied` on that first read and joins blind.
- **Pending invites are not access.** An email sitting in `pendingEmails` can
  read the list (so the invite can be shown), but membership only lands once
  that account signs in and claims it.

## Validation Split
`isValidListShape` checks structure only and is reused by both create and
update. Only `isValidNewList` asserts `createdAt == request.time`.

> Regression note: a single `isValidList` that asserted `createdAt == request.time`
> was previously used for updates as well, while the same rule required
> `incoming().createdAt == existing().createdAt`. Those are unsatisfiable
> together, so every write to a `lists` document was denied — which silently
> broke adding members, removing members, renaming, and both join paths. Any
> future shared validator must not constrain the *value* of a create-only field.

## The Dirty Dozen Payloads (Rejection Tests)
1. **List Spoofing**: Creating a list where `ownerId` is not the current user.
2. **Access Breach**: Reading a list where the current user is not in the `members` array.
3. **Item Hijacking**: Adding an item to a list the user doesn't belong to.
4. **Massive Payload**: Sending a list name larger than 256 characters.
5. **Ghost Item**: Adding an item with a "isVerified" field not in the schema.
6. **Immutable Breach**: Attempting to change the `ownerId` of an existing list.
7. **Role Escalation**: A non-owner member removing another member.
8. **Orphaned Write**: Adding an item to a list that does not exist.
9. **Timestamp Manipulation**: Providing a future timestamp for `updatedAt`.
10. **ID Poisoning**: Using a 2KB string as a list ID.
11. **Mass Join**: A self-join that adds more than one uid, or a uid other than
    the caller's.
12. **Owner Eviction**: An update that removes the owner from `members`.

## Acceptance Payloads (Must Succeed)
Rejection-only tests are what let the unsatisfiable-`createdAt` bug ship. Each
sanctioned transition needs a passing test too:

1. Owner adds an existing user to `members`.
2. Owner removes a non-owner member.
3. Non-owner member appends an email to `pendingEmails`.
4. Invited user signs in and moves themselves from `pendingEmails` to `members`.
5. Link holder (never invited by email) adds themselves to `members`.
6. Member renames the list.

## Test Runner (Draft)
`firestore.rules.test.ts` against the Firestore emulator, using
`@firebase/rules-unit-testing`. Not yet implemented — neither the emulator nor
`firebase-tools` is currently a project dependency.

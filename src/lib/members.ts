/**
 * Single source of truth for list membership changes.
 *
 * Every membership mutation goes through this module so the ShareModal, the
 * invite-link handler and the pending-invite sweep cannot drift apart. Two rules
 * hold everywhere in here:
 *
 *  1. Never read-modify-write an array. `arrayUnion`/`arrayRemove` are atomic, so
 *     two people inviting at once can't clobber each other, and a stale prop in
 *     the UI can't erase a member who was added a moment ago.
 *  2. Never swallow a failure. Callers get a MemberError with a message that is
 *     safe to show a user.
 */

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  type FirestoreError,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './firebase';

/** Mirrors the ceiling enforced by isValidListShape in firestore.rules. */
export const MAX_MEMBERS = 50;
export const MAX_PENDING_INVITES = 50;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

export class MemberError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'MemberError';
  }
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(raw));
}

/** Turns any thrown value into something worth showing a user. */
export function describeMemberError(err: unknown): string {
  if (err instanceof MemberError) return err.message;

  switch ((err as FirestoreError | undefined)?.code) {
    case 'permission-denied':
      return "You don't have permission to change this list's members.";
    case 'not-found':
      return 'That list no longer exists.';
    case 'unavailable':
    case 'failed-precondition':
      return "Can't reach the server. Check your connection and try again.";
    case 'resource-exhausted':
      return 'Too many requests right now. Try again in a moment.';
    default:
      return err instanceof Error && err.message ? err.message : 'Something went wrong.';
  }
}

/** First initial for an avatar bubble, tolerant of blank profiles. */
export function initialFor(profile: { displayName?: string; email?: string }): string {
  const source = profile.displayName?.trim() || profile.email?.trim() || '';
  return source ? source[0].toUpperCase() : '?';
}

export async function lookupUserByEmail(email: string): Promise<UserProfile | null> {
  const snapshot = await getDocs(
    query(collection(db, 'users'), where('email', '==', normalizeEmail(email)), limit(1))
  );
  if (snapshot.empty) return null;

  const found = snapshot.docs[0];
  return { uid: found.id, ...found.data() } as UserProfile;
}

/** Fetches member profiles in parallel; unknown uids come back as placeholders. */
export async function fetchMemberProfiles(uids: string[]): Promise<UserProfile[]> {
  return Promise.all(
    uids.map(async (uid) => {
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) return { uid, ...userDoc.data() } as UserProfile;
      } catch (err) {
        console.error(`Could not load profile for ${uid}:`, err);
      }
      return { uid, displayName: 'Unknown User', email: '' };
    })
  );
}

interface ListSnapshot {
  name: string;
  ownerId: string;
  members: string[];
  pendingEmails: string[];
}

async function readList(listId: string): Promise<ListSnapshot> {
  const snap = await getDoc(doc(db, 'lists', listId));
  if (!snap.exists()) throw new MemberError('That list no longer exists.', 'not-found');

  const data = snap.data();
  return {
    name: data.name ?? '',
    ownerId: data.ownerId ?? '',
    members: data.members ?? [],
    pendingEmails: data.pendingEmails ?? [],
  };
}

export type AddOutcome = 'added' | 'invited' | 'already-member' | 'already-invited';

export interface AddResult {
  outcome: AddOutcome;
  email: string;
  profile?: UserProfile;
}

/**
 * The one entry point for "add this email to this list".
 *
 * Collapses what used to be a three-step dance (search, then add, or else
 * "invite anyway") into a single idempotent call. If the email belongs to a
 * registered user they become a member immediately; otherwise the email is
 * parked in pendingEmails and claimed on their next sign-in.
 *
 * Membership is read fresh from the server rather than trusted from props, so a
 * modal left open for ten minutes still does the right thing.
 */
export async function addMemberByEmail(listId: string, rawEmail: string): Promise<AddResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new MemberError('Enter a valid email address.');

  const list = await readList(listId);
  const listRef = doc(db, 'lists', listId);

  // A lookup failure (offline, rules change) shouldn't block the invite: fall
  // through to a pending invite, which the recipient claims on sign-in anyway.
  let profile: UserProfile | null = null;
  try {
    profile = await lookupUserByEmail(email);
  } catch (err) {
    console.error('User lookup failed, falling back to a pending invite:', err);
  }

  if (profile) {
    if (list.members.includes(profile.uid)) {
      return { outcome: 'already-member', email, profile };
    }
    if (list.members.length >= MAX_MEMBERS) {
      throw new MemberError(`Lists are limited to ${MAX_MEMBERS} members.`);
    }
    await updateDoc(listRef, {
      members: arrayUnion(profile.uid),
      pendingEmails: arrayRemove(email),
    });
    return { outcome: 'added', email, profile };
  }

  if (list.pendingEmails.includes(email)) {
    return { outcome: 'already-invited', email };
  }
  if (list.pendingEmails.length >= MAX_PENDING_INVITES) {
    throw new MemberError(`Lists are limited to ${MAX_PENDING_INVITES} pending invites.`);
  }
  await updateDoc(listRef, { pendingEmails: arrayUnion(email) });
  return { outcome: 'invited', email };
}

export async function removeMember(listId: string, uid: string): Promise<void> {
  if (!uid) throw new MemberError('No member specified.');

  const list = await readList(listId);
  if (list.ownerId === uid) {
    throw new MemberError('The list owner cannot be removed.');
  }
  if (!list.members.includes(uid)) return; // Already gone; nothing to do.

  await updateDoc(doc(db, 'lists', listId), { members: arrayRemove(uid) });
}

/** Withdraws an invite that was never claimed — the fix for a mistyped email. */
export async function revokeInvite(listId: string, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new MemberError('No invite specified.');

  await updateDoc(doc(db, 'lists', listId), { pendingEmails: arrayRemove(email) });
}

export interface JoinResult {
  status: 'joined' | 'already-member';
  /** Undefined when the list wasn't readable until the join completed. */
  name?: string;
}

/**
 * Redeems a share link.
 *
 * Non-members cannot read a list (that invariant is intentional), so a
 * link-holder who was never invited by email gets permission-denied on the read.
 * That is expected, not an error: we join blind, and the list becomes readable
 * once membership lands.
 */
export async function joinListById(listId: string, user: User): Promise<JoinResult> {
  const listRef = doc(db, 'lists', listId);
  const email = user.email ? normalizeEmail(user.email) : '';

  let known: ListSnapshot | null = null;
  try {
    known = await readList(listId);
  } catch (err) {
    if (err instanceof MemberError) throw new MemberError('That invite link is no longer valid.', 'not-found');
    if ((err as FirestoreError)?.code !== 'permission-denied') throw err;
  }

  if (known?.members.includes(user.uid)) {
    return { status: 'already-member', name: known.name };
  }

  try {
    await updateDoc(listRef, {
      members: arrayUnion(user.uid),
      ...(email ? { pendingEmails: arrayRemove(email) } : {}),
    });
  } catch (err) {
    if ((err as FirestoreError)?.code === 'not-found') {
      throw new MemberError('That invite link is no longer valid.', 'not-found');
    }
    throw err;
  }

  return { status: 'joined', name: known?.name };
}

/**
 * Claims every list this user's email was invited to. Safe to run on every
 * sign-in: each list is handled independently and one failure doesn't stop the
 * rest. Returns the number of lists newly joined.
 */
export async function claimPendingInvites(user: User): Promise<number> {
  const email = user.email ? normalizeEmail(user.email) : '';
  if (!email) return 0;

  const snapshot = await getDocs(
    query(collection(db, 'lists'), where('pendingEmails', 'array-contains', email))
  );

  let claimed = 0;
  for (const listDoc of snapshot.docs) {
    const members: string[] = listDoc.data().members ?? [];
    try {
      if (members.includes(user.uid)) {
        // Already a member — just tidy up the stale pending entry.
        await updateDoc(listDoc.ref, { pendingEmails: arrayRemove(email) });
      } else {
        await updateDoc(listDoc.ref, {
          members: arrayUnion(user.uid),
          pendingEmails: arrayRemove(email),
        });
        claimed += 1;
      }
    } catch (err) {
      console.error(`Could not claim invite for list ${listDoc.id}:`, err);
    }
  }
  return claimed;
}

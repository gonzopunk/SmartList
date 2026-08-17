import React, { useCallback, useEffect, useState } from 'react';
import { X, UserPlus, Shield, Trash2, Loader2, Link2, Check, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { User } from 'firebase/auth';
import {
  addMemberByEmail,
  describeMemberError,
  fetchMemberProfiles,
  initialFor,
  isValidEmail,
  removeMember,
  revokeInvite,
  type UserProfile,
} from '../lib/members';

interface ShareModalProps {
  listId: string;
  listName: string;
  memberIds: string[];
  pendingEmails: string[];
  ownerId: string;
  currentUser: User;
  onClose: () => void;
}

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function ShareModal({
  listId,
  listName,
  memberIds,
  pendingEmails,
  ownerId,
  currentUser,
  onClose,
}: ShareModalProps) {
  const [emailInput, setEmailInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Depend on the contents, not the array identity, so a new snapshot with the
  // same members doesn't refetch every profile.
  const memberKey = memberIds.join('|');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingMembers(true);
      const profiles = await fetchMemberProfiles(memberIds);
      if (!cancelled) {
        setMembers(profiles);
        setLoadingMembers(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);

  const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${listId}`;
  const isOwner = currentUser.uid === ownerId;
  const canSubmit = isValidEmail(emailInput) && !isAdding;

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValidEmail(emailInput)) {
        setFeedback({ tone: 'error', text: 'Enter a valid email address.' });
        return;
      }

      setIsAdding(true);
      setFeedback(null);
      try {
        const result = await addMemberByEmail(listId, emailInput);
        setEmailInput("");

        switch (result.outcome) {
          case 'added':
            setFeedback({
              tone: 'success',
              text: `${result.profile?.displayName || result.email} was added to the list.`,
            });
            break;
          case 'invited':
            setFeedback({
              tone: 'success',
              text: `Invited ${result.email}. They'll join automatically when they sign in.`,
            });
            break;
          case 'already-member':
            setFeedback({ tone: 'info', text: 'That person is already a member.' });
            break;
          case 'already-invited':
            setFeedback({ tone: 'info', text: 'That email already has a pending invite.' });
            break;
        }
      } catch (err) {
        console.error('Add member failed:', err);
        setFeedback({ tone: 'error', text: describeMemberError(err) });
      } finally {
        setIsAdding(false);
      }
    },
    [emailInput, listId]
  );

  const handleRemove = async (uid: string) => {
    setBusyId(uid);
    setFeedback(null);
    try {
      await removeMember(listId, uid);
    } catch (err) {
      console.error('Remove member failed:', err);
      setFeedback({ tone: 'error', text: describeMemberError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (email: string) => {
    setBusyId(email);
    setFeedback(null);
    try {
      await revokeInvite(listId, email);
    } catch (err) {
      console.error('Revoke invite failed:', err);
      setFeedback({ tone: 'error', text: describeMemberError(err) });
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
      setFeedback({ tone: 'error', text: 'Could not copy — select the link and copy it manually.' });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">Invite Members</h3>
            <p className="text-xs text-[var(--text-secondary)]">Sharing "{listName}"</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Add by email — one field, one button, no intermediate search step */}
          <div className="space-y-2">
            <label
              htmlFor="invite-email"
              className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest"
            >
              Add by Email
            </label>
            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  placeholder="friend@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setFeedback(null);
                  }}
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold active:scale-[0.98] transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add
              </button>
            </form>
            <p className="text-[10px] text-[var(--text-secondary)] px-1">
              Already using SmartList? They're added right away. If not, we'll hold the invite until they sign in.
            </p>

            <AnimatePresence>
              {feedback && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  className={cn(
                    "text-[11px] font-semibold px-1 pt-1",
                    feedback.tone === 'error' && "text-red-500",
                    feedback.tone === 'success' && "text-green-600 dark:text-green-400",
                    feedback.tone === 'info' && "text-[var(--text-secondary)]"
                  )}
                >
                  {feedback.text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Link Sharing */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              Or Share a Link
            </label>
            <div className="flex items-center gap-2 p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl">
              <div className="flex-1 px-3 py-2 text-xs text-[var(--text-secondary)] truncate font-mono">
                {inviteUrl}
              </div>
              <button
                onClick={copyLink}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0",
                  copied ? "bg-green-500 text-white" : "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                )}
              >
                {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] px-1">
              Anyone with this link can join the list. Share it only with people you trust.
            </p>
          </div>

          {/* Member List */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              Current Members ({memberIds.length})
            </label>
            <div className="divide-y divide-[var(--border-primary)]">
              {loadingMembers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                members.map(member => (
                  <div key={member.uid} className="py-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 shrink-0 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-center text-[var(--text-primary)] text-xs font-bold">
                        {initialFor(member)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {member.displayName || member.email || 'Unknown User'}
                          </p>
                          {member.uid === ownerId && (
                            <Shield className="w-3 h-3 shrink-0 text-indigo-500" title="Owner" />
                          )}
                          {member.uid === currentUser.uid && (
                            <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase">You</span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate">{member.email}</p>
                      </div>
                    </div>
                    {isOwner && member.uid !== ownerId && (
                      <button
                        onClick={() => handleRemove(member.uid)}
                        disabled={busyId === member.uid}
                        className="p-2 shrink-0 text-[var(--text-secondary)] hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all disabled:opacity-50"
                        title="Remove Member"
                      >
                        {busyId === member.uid ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending invites — visible so a typo is fixable */}
          {pendingEmails.length > 0 && (
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                Pending Invites ({pendingEmails.length})
              </label>
              <div className="divide-y divide-[var(--border-primary)]">
                {pendingEmails.map(email => (
                  <div key={email} className="py-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 shrink-0 rounded-full bg-[var(--bg-secondary)] border border-dashed border-[var(--border-primary)] flex items-center justify-center">
                        <Mail className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{email}</p>
                        <p className="text-[10px] text-[var(--text-secondary)]">Joins on next sign-in</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(email)}
                      disabled={busyId === email}
                      className="p-2 shrink-0 text-[var(--text-secondary)] hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all disabled:opacity-50"
                      title="Cancel Invite"
                    >
                      {busyId === email ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

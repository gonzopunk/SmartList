import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { X, Search, UserPlus, Shield, Trash2, Loader2, Link2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { User } from 'firebase/auth';

interface ShareModalProps {
  listId: string;
  listName: string;
  memberIds: string[];
  ownerId: string;
  currentUser: User;
  onClose: () => void;
}

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

export function ShareModal({ listId, listName, memberIds, ownerId, currentUser, onClose }: ShareModalProps) {
  const [searchEmail, setSearchEmail] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null);
  const [searchError, setSearchError] = useState("");
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoadingMembers(true);
      const profiles: UserProfile[] = [];
      for (const uid of memberIds) {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          profiles.push({ uid, ...userDoc.data() } as UserProfile);
        } else {
          profiles.push({ uid, displayName: 'Unknown User', email: '' });
        }
      }
      setMembers(profiles);
      setLoadingMembers(false);
    };
    fetchMembers();
  }, [memberIds]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchEmail.trim()) return;
    
    setIsSearching(true);
    setSearchError("");
    setSearchResult(null);

    try {
      // Ensure we search for lowercase since users should be synced with lowercase emails
      const emailToSearch = searchEmail.trim().toLowerCase();
      const q = query(
        collection(db, 'users'),
        where('email', '==', emailToSearch)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setSearchError("No user found with this email.");
      } else {
        const userData = snapshot.docs[0].data();
        const uid = snapshot.docs[0].id;
        
        if (memberIds.includes(uid)) {
          setSearchError("User is already a member.");
        } else {
          setSearchResult({ uid, ...userData } as UserProfile);
        }
      }
    } catch (err) {
      console.error("Search failed:", err);
      setSearchError("Searching failed. You can still invite them by link.");
    } finally {
      setIsSearching(false);
    }
  };

  const inviteEmailAnyway = async () => {
    if (!searchEmail) return;
    try {
      const listRef = doc(db, 'lists', listId);
      const listSnap = await getDoc(listRef);
      if (listSnap.exists()) {
        const data = listSnap.data();
        const pending = data.pendingEmails || [];
        const email = searchEmail.trim().toLowerCase();
        
        if (!pending.includes(email)) {
          await updateDoc(listRef, {
            pendingEmails: [...pending, email]
          });
        }
        setSearchEmail("");
        setSearchResult(null);
        setSearchError("Invitation sent! They'll be added when they sign in.");
        setTimeout(() => setSearchError(""), 3000);
      }
    } catch (err) {
      console.error("Invite anyway failed:", err);
      setSearchError("Failed to add pending invite.");
    }
  };

  const addMember = async (userId: string) => {
    try {
      const listRef = doc(db, 'lists', listId);
      await updateDoc(listRef, {
        members: [...memberIds, userId]
      });
      setSearchResult(null);
      setSearchEmail("");
    } catch (err) {
      console.error("Add failed:", err);
    }
  };

  const removeMember = async (userId: string) => {
    if (userId === ownerId) return; // Cannot remove owner
    try {
      const listRef = doc(db, 'lists', listId);
      await updateDoc(listRef, {
        members: memberIds.filter(id => id !== userId)
      });
    } catch (err) {
      console.error("Remove failed:", err);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?invite=${listId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOwner = currentUser.uid === ownerId;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-[var(--border-primary)] flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">Invite Members</h3>
            <p className="text-xs text-[var(--text-secondary)]">Sharing "{listName}"</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Link Sharing */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Share Link</label>
            <div className="flex items-center gap-2 p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl">
              <div className="flex-1 px-3 py-2 text-xs text-[var(--text-secondary)] truncate font-mono">
                {window.location.origin}/?invite={listId}
              </div>
              <button 
                onClick={copyLink}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  copied ? "bg-green-500 text-white" : "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                )}
              >
                {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* User Search */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invite by Email</label>
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <input 
                  type="email"
                  placeholder="friend@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
              </div>
              <button 
                type="submit"
                disabled={isSearching}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </form>

            <AnimatePresence>
              {searchError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <p className="text-[10px] text-red-500 font-bold px-1">
                    {searchError}
                  </p>
                  {(searchError.includes("No user found") || searchError.includes("Searching failed")) && searchEmail && (
                    <button
                      onClick={inviteEmailAnyway}
                      className="w-full py-2 px-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-all text-center"
                    >
                      Invite {searchEmail.split('@')[0]} anyway
                    </button>
                  )}
                </motion.div>
              )}

              {searchResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {searchResult.displayName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{searchResult.displayName}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">{searchResult.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => addMember(searchResult.uid)}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    title="Add to List"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Member List */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Current Members</label>
            <div className="divide-y divide-[var(--border-primary)]">
              {loadingMembers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                members.map(member => (
                  <div key={member.uid} className="py-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-center text-[var(--text-primary)] text-xs font-bold">
                        {member.displayName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{member.displayName}</p>
                          {member.uid === ownerId && <Shield className="w-3 h-3 text-indigo-500" title="Owner" />}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)]">{member.email}</p>
                      </div>
                    </div>
                    {isOwner && member.uid !== ownerId && (
                      <button 
                        onClick={() => removeMember(member.uid)}
                        className="p-2 text-[var(--text-secondary)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

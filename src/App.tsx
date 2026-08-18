/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { subscribeToAuth, loginWithGoogle, auth, db } from './lib/firebase';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc, setDoc, getDocs, updateDoc } from 'firebase/firestore';
import { ShoppingList } from './types';
import { Plus, List as ListIcon, LogOut, Loader2, ChevronRight, Share2, Trash2, Moon, Sun, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ListView, normalizeItemFrequency } from './components/ListView';
import { cn } from './lib/utils';
import { claimPendingInvites, describeMemberError, joinListById } from './lib/members';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListLabel, setNewListLabel] = useState("");
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Tracks which uid we've already run invite handling for. A ref, not state, so
  // the effect can't re-enter itself or read a stale value from its closure.
  const invitesHandledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      invitesHandledFor.current = null;
      return;
    }
    if (invitesHandledFor.current === user.uid) return;
    invitesHandledFor.current = user.uid;

    let cancelled = false;

    const handleInvites = async () => {
      // 1. Redeem an ?invite= link if one brought us here.
      const inviteId = new URLSearchParams(window.location.search).get('invite');
      if (inviteId) {
        // Clear the param first so a failure or a reload can't re-trigger a prompt.
        window.history.replaceState({}, '', window.location.pathname);
        try {
          const result = await joinListById(inviteId, user);
          if (cancelled) return;
          setActiveListId(inviteId);
          if (result.status === 'joined') {
            setNotice({
              tone: 'success',
              text: result.name ? `You joined "${result.name}".` : 'You joined the shared list.',
            });
          }
        } catch (err) {
          console.error('Invite link failed:', err);
          if (!cancelled) setNotice({ tone: 'error', text: describeMemberError(err) });
        }
      }

      // 2. Claim any lists this email was invited to before signing up.
      try {
        const claimed = await claimPendingInvites(user);
        if (claimed > 0 && !cancelled) {
          setNotice({
            tone: 'success',
            text: `You were added to ${claimed} shared ${claimed === 1 ? 'list' : 'lists'}.`,
          });
        }
      } catch (err) {
        console.error('Pending invite sweep failed:', err);
      }
    };

    handleInvites();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [largeFont, setLargeFont] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('largeFont') === 'true';
    }
    return false;
  });
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
             window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    if (largeFont) {
      document.documentElement.classList.add('large-font');
    } else {
      document.documentElement.classList.remove('large-font');
    }
    localStorage.setItem('largeFont', largeFont.toString());
  }, [largeFont]);

  useEffect(() => {
    return subscribeToAuth(async (u) => {
      setUser(u);
      setLoading(false);
      
      if (u) {
        // Sync user profile for sharing discovery
        const userRef = doc(db, 'users', u.uid);
        try {
          // Normalize email to lowercase for easier discovery
          const email = u.email?.toLowerCase() || '';
          await setDoc(userRef, {
            displayName: u.displayName || 'Anonymous',
            email: email,
            photoURL: u.photoURL || '',
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Error syncing user profile:", err);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLists([]);
      return;
    }

    const q = query(
      collection(db, 'lists'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const listData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as ShoppingList[];
      setLists(listData);

      // Auto-migrate legacy items across all user's lists
      listData.forEach(async (list) => {
        try {
          const itemsSnap = await getDocs(collection(db, 'lists', list.id, 'items'));
          itemsSnap.docs.forEach(async (itemDoc) => {
            const raw = itemDoc.data();
            const { isStaple, frequency } = normalizeItemFrequency(raw);
            if (raw.frequency !== frequency || raw.isStaple !== isStaple) {
              try {
                await updateDoc(doc(db, 'lists', list.id, 'items', itemDoc.id), {
                  frequency,
                  isStaple,
                  updatedAt: serverTimestamp()
                });
              } catch (err) {
                console.error("Migration error for item:", itemDoc.id, err);
              }
            }
          });
        } catch (err) {
          console.error("Error migrating list items:", list.id, err);
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newListLabel.trim()) return;

    try {
      await addDoc(collection(db, 'lists'), {
        name: newListLabel,
        ownerId: user.uid,
        members: [user.uid],
        createdAt: serverTimestamp()
      });
      setNewListLabel("");
      setIsCreatingList(false);
    } catch (err) {
      console.error("Error creating list:", err);
    }
  };

  const handleLogout = () => auth.signOut();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full bg-white dark:bg-gray-800 p-10 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center"
        >
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-100">
            <ListIcon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">SmartList</h1>
          <p className="text-sm text-gray-400 mb-8 whitespace-pre-wrap">Pure, essential logic for your groceries.</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full py-3.5 bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-black dark:hover:bg-gray-100 text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
          
          <div className="mt-8 flex items-center justify-center gap-6">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkMode ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={() => setLargeFont(!largeFont)}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                largeFont ? "text-blue-500 font-bold" : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              <div className={cn("w-4 h-4 flex items-center justify-center border rounded text-[8px]", largeFont ? "border-blue-500 bg-blue-500 text-white" : "border-gray-400")}>A</div>
              Large Font
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-brand-bg text-[var(--text-primary)] transition-colors duration-200">
      {/* Sidebar - Hidden on mobile, fixed on desktop */}
      <aside className="hidden md:flex w-64 border-r border-[var(--border-primary)] flex-col h-full bg-sidebar-bg">
        <div className="p-8">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 cursor-pointer" onClick={() => setActiveListId(null)}>
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <ListIcon className="w-4 h-4 text-white" />
            </div>
            SmartList
          </h1>
        </div>
        
          <nav className="flex-1 px-4 space-y-1">
            <div className="pb-2 px-4">
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Navigation</p>
            </div>
            <button 
              onClick={() => setActiveListId(null)}
              className={cn(
                "w-full flex items-center px-4 py-2 text-sm rounded-lg transition-colors text-left",
                !activeListId 
                  ? "bg-[var(--border-primary)] text-[var(--text-primary)] font-medium" 
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
              )}
            >
              Dashboard
            </button>
            
            <div className="pt-6 pb-2 px-4">
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">My Lists</p>
            </div>
            {lists.map(list => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={cn(
                  "w-full flex items-center px-4 py-2 text-sm rounded-lg transition-colors text-left truncate",
                  activeListId === list.id 
                    ? "bg-[var(--border-primary)] text-[var(--text-primary)] font-medium" 
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                )}
              >
                {list.name}
              </button>
            ))}
            <button 
              onClick={() => setIsCreatingList(true)}
              className="w-full flex items-center px-4 py-2 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" /> New List
            </button>
          </nav>

        <div className="p-6 border-t border-gray-100 dark:border-gray-800">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {darkMode ? 'Light' : 'Dark'}
              </button>
              <button 
                onClick={() => setLargeFont(!largeFont)}
                className={cn(
                  "flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  largeFont ? "text-blue-600 dark:text-blue-400" : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
                )}
                title="Toggle Large Font for Accessibility"
              >
                <span className={cn("inline-flex items-center justify-center w-5 h-5 border rounded-md text-[10px] font-black", largeFont ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600")}>A</span>
                Large
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 font-bold text-xs ring-1 ring-gray-200 dark:ring-gray-700">
                {user.displayName?.[0] || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{user.displayName}</p>
                <button 
                  onClick={handleLogout}
                  className="text-[10px] text-gray-400 flex items-center gap-1 hover:text-red-500"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-brand-bg">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-10 bg-brand-bg border-b border-[var(--border-primary)] px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2" onClick={() => setActiveListId(null)}>
            <ListIcon className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-[var(--text-primary)]">SmartList</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLargeFont(!largeFont)} className={cn("text-[var(--text-secondary)]", largeFont && "text-blue-500")}>
              <span className={cn("inline-flex items-center justify-center w-6 h-6 border rounded font-black text-xs", largeFont ? "bg-blue-600 border-blue-600 text-white" : "border-[var(--border-primary)] text-[var(--text-secondary)]")}>A</span>
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className="text-[var(--text-secondary)]">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={handleLogout} className="text-[var(--text-secondary)]"><LogOut className="w-5 h-5" /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-4 md:px-12 py-4 md:py-10 transition-colors duration-200">
          <AnimatePresence mode="wait">
            {!activeListId ? (
              <motion.div 
                key="list-selector"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Dashboard</h2>
                  <button 
                    onClick={() => setIsCreatingList(true)}
                    className="md:hidden p-2 text-blue-600"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </header>

                {isCreatingList && (
                  <motion.form 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onSubmit={handleCreateList}
                    className="p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex shadow-sm"
                  >
                    <input 
                      autoFocus
                      placeholder="Name your list..."
                      className="flex-1 px-4 py-2 bg-transparent outline-none text-sm text-[var(--text-primary)]"
                      value={newListLabel}
                      onChange={(e) => setNewListLabel(e.target.value)}
                    />
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg text-xs font-semibold"
                    >
                      Create
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsCreatingList(false)}
                      className="px-4 py-2 text-[var(--text-secondary)] text-xs"
                    >
                      Cancel
                    </button>
                  </motion.form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {lists.map(list => (
                    <motion.div 
                      key={list.id}
                      whileHover={{ y: -2 }}
                      onClick={() => setActiveListId(list.id)}
                      className="group p-5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl cursor-pointer hover:bg-[var(--bg-primary)] hover:border-blue-100 dark:hover:border-blue-900 hover:shadow-xl transition-all text-left"
                    >
                      <h3 className="font-semibold text-[var(--text-primary)] mb-1">{list.name}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">{list.members.length} members</span>
                        <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                      </div>
                    </motion.div>
                  ))}
                  <button 
                    onClick={() => setIsCreatingList(true)}
                    className="p-5 border-2 border-dashed border-[var(--border-primary)] rounded-2xl flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)] hover:border-blue-200 hover:text-blue-400 transition-all font-medium"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-xs uppercase tracking-widest font-bold">New List</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="active-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ListView 
                  listId={activeListId} 
                  listName={lists.find(l => l.id === activeListId)?.name || ""}
                  onBack={() => setActiveListId(null)}
                  user={user}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Invite / join feedback */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
            className={cn(
              "fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 pl-5 pr-3 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-[90vw]",
              notice.tone === 'error' ? "bg-red-600 text-white" : "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
            )}
          >
            <span className="truncate">{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              className="p-1 rounded-full opacity-60 hover:opacity-100 transition-opacity shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

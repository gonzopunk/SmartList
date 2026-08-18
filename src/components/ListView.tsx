import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { ShoppingItem } from '../types';
import { User } from 'firebase/auth';
import { ArrowLeft, Plus, CheckCircle2, Circle, Trash2, Tag, Info, AlertCircle, ShoppingCart, Loader2, Mic, MicOff, FileDown, X, Pencil, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { normalizeItem, bulkNormalizeItems } from '../lib/gemini';
import { cn } from '../lib/utils';
import { ShareModal } from './ShareModal';

const COMMON_CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Frozen', 'Pantry', 'Bakery', 'Household', 'Beverages', 'Other'];

const CATEGORY_COLORS: Record<string, { text: string; dot: string; border: string; icon: string }> = {
  Produce: { text: 'text-emerald-600/70 dark:text-emerald-400/60', dot: 'bg-emerald-400', border: 'border-l-emerald-400/40', icon: 'text-emerald-500/60' },
  Dairy: { text: 'text-blue-600/70 dark:text-blue-400/60', dot: 'bg-blue-400', border: 'border-l-blue-400/40', icon: 'text-blue-500/60' },
  Meat: { text: 'text-rose-600/70 dark:text-rose-400/60', dot: 'bg-rose-400', border: 'border-l-rose-400/40', icon: 'text-rose-500/60' },
  Frozen: { text: 'text-cyan-600/70 dark:text-cyan-400/60', dot: 'bg-cyan-400', border: 'border-l-cyan-400/40', icon: 'text-cyan-500/60' },
  Pantry: { text: 'text-amber-600/70 dark:text-amber-400/60', dot: 'bg-amber-400', border: 'border-l-amber-400/40', icon: 'text-amber-500/60' },
  Bakery: { text: 'text-orange-600/70 dark:text-orange-400/60', dot: 'bg-orange-400', border: 'border-l-orange-400/40', icon: 'text-orange-500/60' },
  Household: { text: 'text-purple-600/70 dark:text-purple-400/60', dot: 'bg-purple-400', border: 'border-l-purple-400/40', icon: 'text-purple-500/60' },
  Beverages: { text: 'text-pink-600/70 dark:text-pink-400/60', dot: 'bg-pink-400', border: 'border-l-pink-400/40', icon: 'text-pink-500/60' },
  Other: { text: 'text-slate-500/70 dark:text-slate-400/60', dot: 'bg-slate-400', border: 'border-l-slate-400/40', icon: 'text-slate-400/60' },
};

interface ItemRowProps {
  item: ShoppingItem;
  isLibrary: boolean;
  selectedItemId: string | null;
  editingNameId: string | null;
  editingQuantityId: string | null;
  editingCategoryId: string | null;
  tempName: string;
  tempQuantity: string;
  setTempName: (val: string) => void;
  setTempQuantity: (val: string) => void;
  setEditingNameId: (val: string | null) => void;
  setEditingQuantityId: (val: string | null) => void;
  setEditingCategoryId: (val: string | null) => void;
  updateName: (item: ShoppingItem, name: string) => void;
  updateQuantity: (item: ShoppingItem, qty: string) => void;
  updateCategory: (item: ShoppingItem, cat: string) => void;
  togglePurchased: (item: ShoppingItem) => void;
  toggleStaple: (item: ShoppingItem) => void;
  deleteItem: (id: string) => void;
  reAddItem: (item: ShoppingItem, isInstant?: boolean) => void;
  handlePointerDown: (e: React.PointerEvent, id: string) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUpOrLeave: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({ 
  item, 
  isLibrary, 
  selectedItemId,
  editingNameId,
  editingQuantityId,
  editingCategoryId,
  tempName,
  tempQuantity,
  setTempName,
  setTempQuantity,
  setEditingNameId,
  setEditingQuantityId,
  setEditingCategoryId,
  updateName,
  updateQuantity,
  updateCategory,
  togglePurchased,
  toggleStaple,
  deleteItem,
  reAddItem,
  handlePointerDown,
  handlePointerMove,
  handlePointerUpOrLeave
}) => {
  const freq = item.frequency || (item.isStaple ? 'staple' : 'occasional');
  
  return (
    <div className="relative">
      <motion.div 
        layout
        onPointerDown={(e) => handlePointerDown(e, item.id)}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => {
          // Instant move logic for library items tapped on the left 25%
          const rect = e.currentTarget.getBoundingClientRect();
          const relativeX = e.clientX - rect.left;
          if (isLibrary && relativeX < rect.width * 0.25) {
            reAddItem(item, true);
          }
          handlePointerUpOrLeave();
        }}
        onPointerLeave={handlePointerUpOrLeave}
        className={cn(
          "group flex items-center min-h-[44px] px-1 transition-all border-l-[3px]",
          CATEGORY_COLORS[item.category]?.border || "border-l-transparent",
          (item.id === selectedItemId || item.id === editingCategoryId || item.id === editingNameId || item.id === editingQuantityId) 
            ? "bg-indigo-50/50 dark:bg-zinc-800/40 selected-item-active shadow-sm border-y border-transparent sm:border-y-indigo-100/50 dark:sm:border-y-zinc-700/30" 
            : "hover:bg-[var(--bg-secondary)]"
        )}
      >
        <div className="flex items-center flex-1 h-[44px] overflow-hidden min-w-0">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              isLibrary ? reAddItem(item, true) : togglePurchased(item);
            }}
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center transition-all flex-shrink-0",
              !isLibrary && item.isPurchased 
                ? "bg-blue-600 border border-blue-600 text-white" 
                : isLibrary
                  ? "text-blue-500 opacity-40 group-hover:opacity-100"
                  : "border border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-white/5"
            )}
          >
            {isLibrary ? <Plus className="w-3 h-3" /> : (item.isPurchased && <CheckCircle2 className="w-3 h-3 stroke-[3]" />)}
          </button>

          <div className="flex items-center gap-2 ml-3 flex-1 overflow-hidden">
            {editingNameId === item.id ? (
              <input
                autoFocus
                className="flex-1 px-2 py-1 rounded-md bg-[var(--bg-primary)] border border-blue-500 text-sm text-[var(--text-primary)] outline-none"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') updateName(item, tempName);
                  if (e.key === 'Escape') setEditingNameId(null);
                }}
                onBlur={() => updateName(item, tempName)}
              />
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  isLibrary ? reAddItem(item, true) : togglePurchased(item);
                }}
                onDoubleClick={() => {
                  setEditingNameId(item.id);
                  setTempName(item.name);
                }}
                className={cn(
                  "text-sm font-normal truncate transition-all text-left",
                  (!isLibrary && item.isPurchased) ? "text-[var(--text-secondary)] opacity-50 line-through" : "text-[var(--text-primary)]"
                )}
              >
                {item.name}
              </button>
            )}

            {item.quantity && !editingQuantityId && !editingNameId && (
              <button 
                onClick={() => {
                  setEditingQuantityId(item.id);
                  setTempQuantity(item.quantity);
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[10px] font-bold text-[var(--accent-text)] whitespace-nowrap transition-all",
                  item.id === selectedItemId ? "inline-block opacity-100" : "inline-block opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                )}
              >
                {item.quantity}
              </button>
            )}

            {!item.quantity && !editingQuantityId && (!isLibrary && !item.isPurchased || isLibrary) && (
              <button 
                onClick={() => {
                  setEditingQuantityId(item.id);
                  setTempQuantity("");
                }}
                className="opacity-40 sm:opacity-0 sm:group-hover:opacity-100 px-1.5 py-0.5 rounded-md bg-[var(--bg-secondary)] border border-dashed border-[var(--border-primary)] text-[8px] font-bold text-[var(--text-secondary)] uppercase whitespace-nowrap hover:border-[var(--accent-text)] hover:text-[var(--accent-text)] transition-all"
              >
                + Qty
              </button>
            )}

            {editingQuantityId === item.id && (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  className="w-16 px-1.5 py-0.5 rounded-md bg-[var(--bg-primary)] border border-blue-500 text-[10px] font-bold text-[var(--text-primary)] outline-none"
                  value={tempQuantity}
                  onChange={e => setTempQuantity(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') updateQuantity(item, tempQuantity);
                    if (e.key === 'Escape') setEditingQuantityId(null);
                  }}
                  onBlur={() => updateQuantity(item, tempQuantity)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button 
            onClick={() => {
              setEditingNameId(item.id);
              setTempName(item.name);
            }}
            className={cn(
              "h-[44px] px-2 flex items-center text-[var(--text-secondary)] hover:text-blue-500 transition-opacity",
              item.id === selectedItemId ? "flex opacity-100" : "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100"
            )}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setEditingCategoryId(editingCategoryId === item.id ? null : item.id)}
            className={cn(
              "h-[44px] px-2 flex items-center transition-opacity",
              item.id === selectedItemId ? "flex opacity-100" : "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100",
              item.isStaple ? "text-indigo-600" : (CATEGORY_COLORS[item.category]?.icon || "text-blue-500/70 hover:text-blue-500")
            )}
          >
            <Tag className={cn("w-4 h-4", item.isStaple && "fill-indigo-50 dark:fill-indigo-900/20")} />
          </button>
          
          <button 
            onClick={() => toggleStaple(item)}
            className={cn(
              "h-[44px] px-2 flex items-center text-[8px] font-bold uppercase tracking-widest transition-opacity",
              item.id === selectedItemId ? "flex opacity-100" : "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100",
              freq === 'staple' ? "text-indigo-600" : 
              freq === 'special' ? "text-amber-600 dark:text-amber-400" : "text-[var(--text-secondary)]"
            )}
          >
            {freq === 'staple' ? "Staple" : freq === 'special' ? "Special" : "Occas"}
          </button>

          <button 
            onClick={() => deleteItem(item.id)}
            className={cn(
              "h-[44px] px-2 flex items-center text-[var(--text-secondary)] hover:text-red-500 transition-opacity",
              item.id === selectedItemId ? "flex opacity-100" : "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100"
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {editingCategoryId === item.id && (
          <div className="absolute right-0 top-[44px] w-48 bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-2xl rounded-xl z-20 p-1 grid grid-cols-1 gap-0.5">
            <p className="text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-3 py-2">Categorize</p>
            {COMMON_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => updateCategory(item, cat)}
                className={cn(
                  "h-10 px-3 text-xs text-left rounded-lg transition-colors flex items-center",
                  item.category === cat ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold" : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};
// Removed duplicated imports

interface ListViewProps {
  listId: string;
  listName: string;
  onBack: () => void;
  user: User;
}

export function ListView({ listId, listName, onBack, user }: ListViewProps) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [listMetadata, setListMetadata] = useState<{ ownerId: string; members: string[]; pendingEmails: string[] } | null>(null);
  const [importText, setImportText] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [frozenStates, setFrozenStates] = useState<Record<string, { isInLibrary: boolean; frequency: string; category: string }>>({});
  const [viewMode, setViewMode] = useState<'shopping' | 'staples' | 'as-needed'>('shopping');
  const [lastMovedItem, setLastMovedItem] = useState<{ id: string; listId: string; wasInLibrary: boolean } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (lastMovedItem) {
      const timer = setTimeout(() => setLastMovedItem(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [lastMovedItem]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    // Tap to exit logic for edit/selection/category modes
    const isActive = selectedItemId || editingCategoryId || editingNameId || editingQuantityId;

    if (isActive) {
      const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
        const target = e.target as HTMLElement;
        // If clicking outside the active item row or its controls
        if (!target.closest('.selected-item-active')) {
          setSelectedItemId(null);
          setEditingCategoryId(null);
          setEditingNameId(null);
          setEditingQuantityId(null);
          setFrozenStates({});
        }
      };
      
      // Delay listener attachment slightly to avoid the initial trigger
      const timeout = setTimeout(() => {
        document.addEventListener('mousedown', handleGlobalClick);
        document.addEventListener('touchstart', handleGlobalClick);
      }, 100);

      return () => {
        clearTimeout(timeout);
        document.removeEventListener('mousedown', handleGlobalClick);
        document.removeEventListener('touchstart', handleGlobalClick);
      };
    }
  }, [selectedItemId, editingCategoryId, editingNameId, editingQuantityId]);

  useEffect(() => {
    // Autosuggest logic
    if (inputValue.trim().length > 0) {
      const filtered = items
        .filter(i => i.name.toLowerCase().includes(inputValue.toLowerCase()))
        .map(i => i.name);
      
      // Also add some common items if none found
      const commons = ['Milk', 'Eggs', 'Bread', 'Butter', 'Chicken', 'Apples', 'Bananas', 'Potatoes', 'Onions', 'Rice', 'Pasta', 'Coffee']
        .filter(name => name.toLowerCase().includes(inputValue.toLowerCase()) && !filtered.includes(name));
      
      setSuggestions([...new Set([...filtered, ...commons])].slice(0, 5));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [inputValue, items]);

  useEffect(() => {
    // Fetch list metadata for sharing
    const listRef = doc(db, 'lists', listId);
    const unsubscribeMetadata = onSnapshot(listRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setListMetadata({
          ownerId: data.ownerId,
          members: data.members ?? [],
          pendingEmails: data.pendingEmails ?? [],
        });
      }
    });

    // Fetch all items and filter in memory to handle schema transitions gracefully
    const q = query(
      collection(db, 'lists', listId, 'items'),
      orderBy('name', 'asc')
    );

    const unsubscribeItems = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(d => ({
        id: d.id,
        listId,
        ...d.data()
      })) as ShoppingItem[];
      setItems(itemData);
    });

    return () => {
      unsubscribeMetadata();
      unsubscribeItems();
    };
  }, [listId]);

  const performAddItem = async (text: string) => {
    if (!text.trim() || isAdding) return;

    setIsAdding(true);

    try {
      const { normalizedName, category, isStapleSuggestion, quantity } = await normalizeItem(text);
      
      const duplicate = items.find(i => i.name.toLowerCase() === normalizedName.toLowerCase());
      
      if (duplicate) {
        // Automatically move from library/purchased to active list
        if (duplicate.isInLibrary || duplicate.isPurchased) {
          const itemRef = doc(db, 'lists', listId, 'items', duplicate.id);
          await updateDoc(itemRef, {
            isInLibrary: false,
            isPurchased: false,
            updatedAt: serverTimestamp()
          });
        }
        setInputValue("");
        setIsAdding(false);
        return;
      }

      await addDoc(collection(db, 'lists', listId, 'items'), {
        name: normalizedName,
        originalName: text,
        category,
        isStaple: isStapleSuggestion,
        isPurchased: false,
        isInLibrary: false,
        quantity: quantity || "",
        addedBy: user.uid,
        updatedAt: serverTimestamp()
      });

      setInputValue("");
    } catch (err) {
      console.error("Failed to add item:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await performAddItem(inputValue);
  };

  const handleBulkImport = async () => {
    if (!importText.trim() || isBulkImporting) return;
    setIsBulkImporting(true);
    try {
      const itemsToImport = await bulkNormalizeItems(importText);
      
      // Batch add items
      for (const item of itemsToImport) {
        const duplicate = items.find(i => i.name.toLowerCase() === item.normalizedName.toLowerCase());
        
        if (duplicate) {
          // Move existing item to shopping list if it's currently in library
          if (duplicate.isInLibrary || duplicate.isPurchased) {
            const itemRef = doc(db, 'lists', listId, 'items', duplicate.id);
            await updateDoc(itemRef, {
              isInLibrary: false,
              isPurchased: false,
              updatedAt: serverTimestamp()
            });
          }
        } else {
          await addDoc(collection(db, 'lists', listId, 'items'), {
            name: item.normalizedName,
            originalName: "Bulk Import",
            category: item.category,
            isStaple: item.isStapleSuggestion,
            isPurchased: !!item.isPurchased,
            isInLibrary: false, // Import directly to shopping list for consistency
            quantity: item.quantity || "",
            addedBy: user.uid,
            updatedAt: serverTimestamp()
          });
        }
      }
      
      setImportText("");
      setIsImportModalOpen(false);
    } catch (err) {
      console.error("Bulk import failed:", err);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const togglePurchased = async (item: ShoppingItem) => {
    try {
      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        isPurchased: !item.isPurchased,
        isInLibrary: item.isInLibrary ?? false,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const toggleStaple = async (item: ShoppingItem) => {
    try {
      const frequencies: ('staple' | 'occasional' | 'special')[] = ['staple', 'occasional', 'special'];
      const currentFreq = item.frequency || (item.isStaple ? 'staple' : 'occasional');
      const nextFreq = frequencies[(frequencies.indexOf(currentFreq) + 1) % frequencies.length];
      
      // Freeze state if not already selected
      if (selectedItemId !== item.id) {
        setSelectedItemId(item.id);
      }
      setFrozenStates(prev => ({
        ...prev,
        [item.id]: prev[item.id] || { isInLibrary: item.isInLibrary ?? false, frequency: currentFreq, category: item.category }
      }));

      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        frequency: nextFreq,
        isStaple: nextFreq === 'staple', // Keep legacy sync
        isInLibrary: item.isInLibrary ?? false,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const updateCategory = async (item: ShoppingItem, newCategory: string) => {
    try {
      // Freeze state to keep item in current section until tapping away
      if (selectedItemId !== item.id) {
        setSelectedItemId(item.id);
      }
      const currentFreq = item.frequency || (item.isStaple ? 'staple' : 'occasional');
      setFrozenStates(prev => ({
        ...prev,
        [item.id]: prev[item.id] || { isInLibrary: item.isInLibrary ?? false, frequency: currentFreq, category: item.category }
      }));

      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        category: newCategory,
        isInLibrary: item.isInLibrary ?? false,
        updatedAt: serverTimestamp()
      });
      setEditingCategoryId(null);
    } catch (err) {
      console.error("Category update failed:", err);
    }
  };

  const updateQuantity = async (item: ShoppingItem, newQuantity: string) => {
    try {
      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        quantity: newQuantity,
        isInLibrary: item.isInLibrary ?? false,
        updatedAt: serverTimestamp()
      });
      setEditingQuantityId(null);
    } catch (err) {
      console.error("Quantity update failed:", err);
    }
  };

  // Removed ItemRow from here to fix cursor jump and re-mounting bugs

  const updateName = async (item: ShoppingItem, newName: string) => {
    if (!newName.trim() || newName === item.name) {
      setEditingNameId(null);
      return;
    }
    try {
      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        name: newName.trim(),
        isInLibrary: item.isInLibrary ?? false,
        updatedAt: serverTimestamp()
      });
      setEditingNameId(null);
    } catch (err) {
      console.error("Name update failed:", err);
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false; // Stop after a pause

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const result = event.results[0];
      const transcript = result[0].transcript;
      setInputValue(transcript);

      if (result.isFinal) {
        recognition.stop();
        // Wait a small beat before auto-adding so user sees the text
        setTimeout(() => {
          performAddItem(transcript);
        }, 300);
      }
    };

    recognition.start();
  };

  const deleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'lists', listId, 'items', itemId));
      if (selectedItemId === itemId) setSelectedItemId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, itemId: string) => {
    // If already selected, we don't restart the timer (let global click handle dismissal)
    if (selectedItemId === itemId) return;
    
    // Only handle primary button (left-click/touch)
    if (e.button !== 0) return;
    
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    
    longPressTimer.current = setTimeout(() => {
      setSelectedItemId(itemId);
      // Freeze the relevant layout state to prevent jumping
      const item = items.find(i => i.id === itemId);
      if (item) {
        setFrozenStates({
          [itemId]: { 
            isInLibrary: item.isInLibrary ?? false, 
            frequency: item.frequency || (item.isStaple ? 'staple' : 'occasional'),
            category: item.category 
          }
        });
      }
      if ('vibrate' in navigator) navigator.vibrate(50);
    }, 600);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!touchStartPos.current) return;
    const dist = Math.sqrt(
      Math.pow(e.clientX - touchStartPos.current.x, 2) + 
      Math.pow(e.clientY - touchStartPos.current.y, 2)
    );
    // If user moves more than 10px, they are likely scrolling - cancel long press
    if (dist > 10) {
      handlePointerUpOrLeave();
    }
  };

  const handlePointerUpOrLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  const clearCompleted = async () => {
    const completedItems = items.filter(i => i.isPurchased);
    for (const item of completedItems) {
      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        isInLibrary: true,
        isPurchased: false, // Prep for re-adding
        updatedAt: serverTimestamp()
      });
    }
  };

  const reAddItem = async (item: ShoppingItem, isInstant: boolean = false) => {
    try {
      if (isInstant) {
        // Clear frozen state for instant moves to ensure immediate disappearance
        setFrozenStates(prev => {
          if (!prev[item.id]) return prev;
          const newState = { ...prev };
          delete newState[item.id];
          return newState;
        });
        if (selectedItemId === item.id) setSelectedItemId(null);
      } else {
        // Freeze state in place in library view for selection-based moves
        if (selectedItemId !== item.id) {
          setSelectedItemId(item.id);
        }
        const currentFreq = item.frequency || (item.isStaple ? 'staple' : 'occasional');
        setFrozenStates(prev => ({
          ...prev,
          [item.id]: { isInLibrary: item.isInLibrary ?? false, frequency: currentFreq, category: item.category }
        }));
      }

      const itemRef = doc(db, 'lists', listId, 'items', item.id);
      await updateDoc(itemRef, {
        isInLibrary: false,
        isPurchased: false,
        updatedAt: serverTimestamp()
      });

      // Track for Undo
      setLastMovedItem({ id: item.id, listId, wasInLibrary: !!item.isInLibrary });
    } catch (err) {
      console.error("Re-add failed:", err);
    }
  };

  const undoMove = async () => {
    if (!lastMovedItem) return;
    try {
      const itemRef = doc(db, 'lists', lastMovedItem.listId, 'items', lastMovedItem.id);
      await updateDoc(itemRef, {
        isInLibrary: lastMovedItem.wasInLibrary,
        updatedAt: serverTimestamp()
      });
      setLastMovedItem(null);
    } catch (err) {
      console.error("Undo failed:", err);
    }
  };

  const filteredItems = items.filter(item => {
    const isFrozen = frozenStates[item.id];
    const inLibrary = isFrozen ? isFrozen.isInLibrary : !!item.isInLibrary;

    if (viewMode === 'shopping') return !inLibrary;
    
    if (inLibrary) {
      const freq = isFrozen ? isFrozen.frequency : (item.frequency || (item.isStaple ? 'staple' : 'occasional'));
      if (viewMode === 'staples') return freq === 'staple';
      if (viewMode === 'as-needed') return freq !== 'staple';
    }
    return false;
  }).sort((a, b) => {
    if (a.isPurchased !== b.isPurchased) return a.isPurchased ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  // Organize by category
  const categories: string[] = [...new Set<string>(filteredItems.map(i => {
    const isFrozen = frozenStates[i.id];
    return isFrozen ? isFrozen.category : i.category;
  }))].sort();

  return (
    <div className="space-y-4 h-full text-[var(--text-primary)]">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={onBack}
              className="md:hidden p-1 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--text-primary)]" />
            </button>
            <h2 
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const timer = setTimeout(() => {
                  setIsImportModalOpen(true);
                  if ('vibrate' in navigator) navigator.vibrate(50);
                }, 1500);
                const cancel = () => clearTimeout(timer);
                e.currentTarget.addEventListener('pointerup', cancel, { once: true });
                e.currentTarget.addEventListener('pointerleave', cancel, { once: true });
              }}
              className="text-xl font-semibold text-[var(--text-primary)] cursor-default select-none"
            >
              {listName}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              {filteredItems.length} {viewMode === 'shopping' ? 'items' : 'in library'}
            </span>
            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Invite</span>
            </button>
            {viewMode === 'shopping' && (
              <button
                onClick={clearCompleted}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline disabled:text-[var(--text-secondary)] transition-colors"
                disabled={!filteredItems.some(i => i.isPurchased)}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex p-1 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] w-full max-w-md mx-auto">
          <button 
            onClick={() => setViewMode('shopping')}
            className={cn(
              "flex-1 py-2 text-[10px] font-black uppercase tracking-[0.1em] rounded-lg transition-all flex items-center justify-center gap-1.5",
              viewMode === 'shopping' 
                ? "bg-[var(--bg-primary)] text-blue-600 shadow-sm border border-[var(--border-primary)]" 
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Shopping
          </button>
          <button 
            onClick={() => setViewMode('staples')}
            className={cn(
              "flex-1 py-2 text-[10px] font-black uppercase tracking-[0.1em] rounded-lg transition-all flex items-center justify-center gap-1.5",
              viewMode === 'staples' 
                ? "bg-[var(--bg-primary)] text-indigo-600 shadow-sm border border-[var(--border-primary)]" 
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <Tag className="w-3.5 h-3.5 fill-current opacity-20" />
            Staples
          </button>
          <button 
            onClick={() => setViewMode('as-needed')}
            className={cn(
              "flex-1 py-2 text-[10px] font-black uppercase tracking-[0.1em] rounded-lg transition-all flex items-center justify-center gap-1.5",
              viewMode === 'as-needed' 
                ? "bg-[var(--bg-primary)] text-amber-600 shadow-sm border border-[var(--border-primary)]" 
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <Tag className="w-3.5 h-3.5" />
            As Needed
          </button>
        </div>
      </header>

      <form onSubmit={handleAddItem} className="relative group z-30">
        <div className="bg-[var(--bg-secondary)] p-0.5 border border-[var(--border-primary)] rounded-lg focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all flex items-center">
          <input 
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder={isListening ? "Listening..." : "Add item..."}
            className="flex-1 px-3 py-3 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
            disabled={isAdding}
          />
          <div className="pr-1 flex items-center gap-1">
            <button
              type="button"
              onClick={startListening}
              className={cn(
                "p-2 rounded-full transition-all",
                isListening ? "bg-red-500 text-white animate-pulse" : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
              )}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            {isAdding && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
          </div>
        </div>

        {/* Autosuggest Dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 right-0 top-full mt-1 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl shadow-2xl overflow-hidden z-40"
            >
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    performAddItem(s);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] last:border-0 flex items-center justify-between group"
                >
                  <span className="text-[var(--text-primary)]">{s}</span>
                  <Plus className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <div className="space-y-4 pb-20">
        {categories.map((category: string) => {
          const colors = CATEGORY_COLORS[category as string] || CATEGORY_COLORS['Other'];
          return (
            <section key={category}>
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <div className={cn("w-1 h-1 rounded-full", colors.dot)} />
                <h3 className={cn("text-[8px] font-black uppercase tracking-[0.25em]", colors.text)}>
                  {category}
                </h3>
              </div>
              <div className="divide-y divide-[var(--border-primary)] border-t border-[var(--border-primary)]">
                {filteredItems
                  .filter(i => {
                    const isFrozen = frozenStates[i.id];
                    const itemCategory = isFrozen ? isFrozen.category : i.category;
                    return itemCategory === category;
                  })
                  .map(item => (
                    <ItemRow 
                      key={item.id} 
                      item={item} 
                      isLibrary={viewMode !== 'shopping'}
                      selectedItemId={selectedItemId}
                      editingNameId={editingNameId}
                      editingQuantityId={editingQuantityId}
                      editingCategoryId={editingCategoryId}
                      tempName={tempName}
                      tempQuantity={tempQuantity}
                      setTempName={setTempName}
                      setTempQuantity={setTempQuantity}
                      setEditingNameId={setEditingNameId}
                      setEditingQuantityId={setEditingQuantityId}
                      setEditingCategoryId={setEditingCategoryId}
                      updateName={updateName}
                      updateQuantity={updateQuantity}
                      updateCategory={updateCategory}
                      togglePurchased={togglePurchased}
                      toggleStaple={toggleStaple}
                      deleteItem={deleteItem}
                      reAddItem={reAddItem}
                      handlePointerDown={handlePointerDown}
                      handlePointerMove={handlePointerMove}
                      handlePointerUpOrLeave={handlePointerUpOrLeave}
                    />
                  ))}
              </div>
            </section>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-200 gap-4">
          <ShoppingCart className="w-16 h-16" />
          <p className="text-xs uppercase tracking-widest font-bold">Empty List</p>
        </div>
      )}

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">Import Items</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Paste your list from Google Keep, Notes, or any text source.</p>
                  </div>
                  <button 
                    onClick={() => setIsImportModalOpen(false)}
                    className="p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <textarea 
                  autoFocus
                  placeholder="Example:&#10;3 apples&#10;Milk&#10;Frozen peas (2 bags)"
                  className="w-full h-48 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />

                <div className="flex items-center justify-between gap-3 pt-2">
                  <p className="text-[10px] text-[var(--text-secondary)] italic">
                    AI will automatically categorize and extract quantities.
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleBulkImport}
                      disabled={!importText.trim() || isBulkImporting}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                    >
                      {isBulkImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isBulkImporting ? "Importing..." : "Smart Import"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {isShareModalOpen && listMetadata && (
          <ShareModal 
            listId={listId}
            listName={listName}
            memberIds={listMetadata.members}
            pendingEmails={listMetadata.pendingEmails}
            ownerId={listMetadata.ownerId}
            currentUser={user}
            onClose={() => setIsShareModalOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Undo Notification */}
      <AnimatePresence>
        {lastMovedItem && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%" }}
            className="fixed bottom-6 left-1/2 z-[100] flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 text-white shadow-2xl rounded-full min-w-fit"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium whitespace-nowrap">Added to list</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                undoMove();
              }}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors text-blue-400 border border-white/5"
            >
              Undo
            </button>
            <button 
              onClick={() => setLastMovedItem(null)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-3 h-3 opacity-60 hover:opacity-100" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loader2Icon() {
  return <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Plus className="w-6 h-6 opacity-50" /></motion.div>;
}

import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ShoppingItem } from '../types';
import { X, Plus, Trash2, Pencil, Check, ArrowUp, ArrowDown, Sparkles, Tag, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export const DEFAULT_GROCERY_CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat',
  'Frozen',
  'Pantry',
  'Bakery',
  'Household',
  'Beverages',
  'Other'
];

export const CATEGORY_PRESETS: { name: string; categories: string[] }[] = [
  {
    name: 'Grocery Essentials',
    categories: ['Produce', 'Dairy', 'Meat', 'Frozen', 'Pantry', 'Bakery', 'Household', 'Beverages', 'Other']
  },
  {
    name: 'Alcohol & Drinks',
    categories: ['Beer & Cider', 'Wine', 'Spirits & Liquor', 'Mixers & Soda', 'Bar Snacks', 'Ice & Garnishes', 'Other']
  },
  {
    name: 'Hardware & Home',
    categories: ['Hardware & Fasteners', 'Tools', 'Lumber & Building', 'Paint & Supplies', 'Electrical', 'Plumbing', 'Garden & Outdoor', 'Other']
  },
  {
    name: 'Pharmacy & Wellness',
    categories: ['Medicines', 'First Aid', 'Skincare', 'Personal Care', 'Vitamins & Supplements', 'Dental', 'Other']
  },
  {
    name: 'General & Department',
    categories: ['Food & Pantry', 'Electronics', 'Home Goods', 'Clothing', 'Office & Stationery', 'Pets', 'Other']
  }
];

const PALETTE = [
  { text: 'text-emerald-600/70 dark:text-emerald-400/60', dot: 'bg-emerald-400', border: 'border-l-emerald-400/40', icon: 'text-emerald-500/60' },
  { text: 'text-blue-600/70 dark:text-blue-400/60', dot: 'bg-blue-400', border: 'border-l-blue-400/40', icon: 'text-blue-500/60' },
  { text: 'text-rose-600/70 dark:text-rose-400/60', dot: 'bg-rose-400', border: 'border-l-rose-400/40', icon: 'text-rose-500/60' },
  { text: 'text-amber-600/70 dark:text-amber-400/60', dot: 'bg-amber-400', border: 'border-l-amber-400/40', icon: 'text-amber-500/60' },
  { text: 'text-purple-600/70 dark:text-purple-400/60', dot: 'bg-purple-400', border: 'border-l-purple-400/40', icon: 'text-purple-500/60' },
  { text: 'text-cyan-600/70 dark:text-cyan-400/60', dot: 'bg-cyan-400', border: 'border-l-cyan-400/40', icon: 'text-cyan-500/60' },
  { text: 'text-orange-600/70 dark:text-orange-400/60', dot: 'bg-orange-400', border: 'border-l-orange-400/40', icon: 'text-orange-500/60' },
  { text: 'text-pink-600/70 dark:text-pink-400/60', dot: 'bg-pink-400', border: 'border-l-pink-400/40', icon: 'text-pink-500/60' },
  { text: 'text-indigo-600/70 dark:text-indigo-400/60', dot: 'bg-indigo-400', border: 'border-l-indigo-400/40', icon: 'text-indigo-500/60' },
  { text: 'text-teal-600/70 dark:text-teal-400/60', dot: 'bg-teal-400', border: 'border-l-teal-400/40', icon: 'text-teal-500/60' },
  { text: 'text-violet-600/70 dark:text-violet-400/60', dot: 'bg-violet-400', border: 'border-l-violet-400/40', icon: 'text-violet-500/60' },
  { text: 'text-lime-600/70 dark:text-lime-400/60', dot: 'bg-lime-400', border: 'border-l-lime-400/40', icon: 'text-lime-500/60' },
];

export function getCategoryColor(category: string): { text: string; dot: string; border: string; icon: string } {
  if (category.toLowerCase() === 'other') {
    return { text: 'text-slate-500/70 dark:text-slate-400/60', dot: 'bg-slate-400', border: 'border-l-slate-400/40', icon: 'text-slate-400/60' };
  }
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash << 5) - hash + category.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

interface CategoriesModalProps {
  listId: string;
  listName: string;
  categories: string[];
  items: ShoppingItem[];
  onClose: () => void;
  onUpdateCategories: (newCategories: string[]) => void;
}

export function CategoriesModal({
  listId,
  listName,
  categories,
  items,
  onClose,
  onUpdateCategories
}: CategoriesModalProps) {
  const [catList, setCatList] = useState<string[]>(categories && categories.length > 0 ? categories : DEFAULT_GROCERY_CATEGORIES);
  const [newCatInput, setNewCatInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null);

  // Compute item count per category in this list
  const categoryCounts: Record<string, number> = {};
  items.forEach(item => {
    const cat = item.category || 'Other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const saveToFirestore = async (updated: string[]) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'lists', listId), {
        categories: updated
      });
      onUpdateCategories(updated);
    } catch (err) {
      console.error('Failed to update categories:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    
    // Check if category already exists (case-insensitive)
    if (catList.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewCatInput('');
      return;
    }

    const updated = [...catList, trimmed];
    setCatList(updated);
    setNewCatInput('');
    await saveToFirestore(updated);
  };

  const handleStartRename = (index: number) => {
    setEditingIndex(index);
    setEditingValue(catList[index]);
  };

  const handleSaveRename = async (index: number) => {
    const oldName = catList[index];
    const newName = editingValue.trim();
    setEditingIndex(null);

    if (!newName || newName === oldName) return;

    // Check duplicate
    if (catList.some((c, i) => i !== index && c.toLowerCase() === newName.toLowerCase())) {
      return;
    }

    const updated = [...catList];
    updated[index] = newName;
    setCatList(updated);

    // Update list doc
    await saveToFirestore(updated);

    // Update items in list with the old category name
    try {
      const itemsSnap = await getDocs(collection(db, 'lists', listId, 'items'));
      const batch = writeBatch(db);
      let count = 0;
      itemsSnap.docs.forEach(d => {
        if (d.data().category === oldName) {
          batch.update(d.ref, {
            category: newName,
            updatedAt: serverTimestamp()
          });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.error('Failed to batch update items on category rename:', err);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    const count = categoryCounts[catToDelete] || 0;
    if (count > 0 && confirmDeleteCat !== catToDelete) {
      // Need confirmation
      setConfirmDeleteCat(catToDelete);
      return;
    }

    setConfirmDeleteCat(null);

    const updated = catList.filter(c => c !== catToDelete);
    // Ensure at least "Other" remains if list is empty
    if (updated.length === 0) {
      updated.push('Other');
    }
    setCatList(updated);
    await saveToFirestore(updated);

    // If items had this category, reassign them to "Other"
    if (count > 0) {
      try {
        const itemsSnap = await getDocs(collection(db, 'lists', listId, 'items'));
        const batch = writeBatch(db);
        let updatedCount = 0;
        itemsSnap.docs.forEach(d => {
          if (d.data().category === catToDelete) {
            batch.update(d.ref, {
              category: 'Other',
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        });
        if (updatedCount > 0) {
          await batch.commit();
        }
      } catch (err) {
        console.error('Failed to reassign items on category delete:', err);
      }
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= catList.length) return;

    const updated = [...catList];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    setCatList(updated);
    await saveToFirestore(updated);
  };

  const handleApplyPreset = async (presetCategories: string[]) => {
    setCatList(presetCategories);
    setShowPresets(false);
    await saveToFirestore(presetCategories);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Categories</h3>
              <p className="text-xs text-[var(--text-secondary)]">Customized for &ldquo;{listName}&rdquo;</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input 
              type="text"
              placeholder="Add category (e.g. Beer, Wine, Tools)..."
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!newCatInput.trim() || isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {/* Preset templates trigger */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              {catList.length} Categories
            </span>
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Presets & Templates</span>
            </button>
          </div>

          {/* Preset options */}
          <AnimatePresence>
            {showPresets && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-primary)] space-y-2 text-xs"
              >
                <p className="font-semibold text-[var(--text-primary)] text-xs mb-1">Select a category starter:</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {CATEGORY_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => handleApplyPreset(preset.categories)}
                      className="text-left p-2 rounded-lg bg-[var(--bg-primary)] hover:border-blue-500 border border-[var(--border-primary)] transition-all flex flex-col gap-0.5"
                    >
                      <div className="font-medium text-[var(--text-primary)]">{preset.name}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] truncate">
                        {preset.categories.join(' • ')}
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Warning banner when delete confirmation is pending */}
          {confirmDeleteCat && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">
                  {categoryCounts[confirmDeleteCat]} item(s) are in &ldquo;{confirmDeleteCat}&rdquo;.
                </p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  Deleting will move those items to &ldquo;Other&rdquo;. Confirm delete?
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleDeleteCategory(confirmDeleteCat)}
                    className="px-2.5 py-1 bg-red-600 text-white rounded-md text-[10px] font-bold"
                  >
                    Delete & Reassign
                  </button>
                  <button
                    onClick={() => setConfirmDeleteCat(null)}
                    className="px-2.5 py-1 bg-gray-200 dark:bg-gray-700 text-[var(--text-primary)] rounded-md text-[10px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Categories List */}
          <div className="space-y-1.5 divide-y divide-[var(--border-primary)]">
            {catList.map((category, index) => {
              const colors = getCategoryColor(category);
              const itemCount = categoryCounts[category] || 0;
              const isEditing = editingIndex === index;

              return (
                <div 
                  key={category + index}
                  className="pt-1.5 first:pt-0 flex items-center justify-between group gap-2"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          autoFocus
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(index);
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                          className="flex-1 px-2 py-1 bg-[var(--bg-secondary)] border border-blue-500 rounded-lg text-xs text-[var(--text-primary)] outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(index)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingIndex(null)}
                          className="p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {category}
                        </span>
                        {itemCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-medium">
                            {itemCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Move up/down buttons */}
                      <button
                        onClick={() => handleMove(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMove(index, 'down')}
                        disabled={index === catList.length - 1}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Rename button */}
                      <button
                        onClick={() => handleStartRename(index)}
                        className="p-1 text-[var(--text-secondary)] hover:text-blue-500 transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteCategory(category)}
                        className="p-1 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] flex items-center justify-between">
          <p className="text-[10px] text-[var(--text-secondary)]">
            Changes save automatically to this list.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Tracks how many items are still outstanding on each list, so the dashboard
 * can say which stops still need making.
 *
 * "Outstanding" means on the shopping list and not yet checked off:
 * isInLibrary falsy and isPurchased false. Library items are parked, not
 * needed; purchased items are already in the basket.
 *
 * The query filters on isPurchased only, never isInLibrary. isPurchased has
 * been a required field since the first ruleset, so every item document has
 * it. isInLibrary is optional and older items can omit it entirely — and a
 * Firestore equality filter silently skips documents missing the field, which
 * would hide legacy items from the count. ListView reads it as
 * `item.isInLibrary ?? false`, so this filters it the same way, client side.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

export type OutstandingCounts = Record<string, number>;

export function useOutstandingCounts(listIds: string[]): OutstandingCounts {
  const [counts, setCounts] = useState<OutstandingCounts>({});

  // Depend on contents rather than array identity: a new lists snapshot with
  // the same ids shouldn't tear down and rebuild every listener.
  const key = [...listIds].sort().join('|');

  useEffect(() => {
    const ids = key ? key.split('|') : [];

    if (ids.length === 0) {
      setCounts({});
      return;
    }

    // Drop counts for lists we no longer have access to, so a removed list
    // can't leave a stale number on screen.
    setCounts(prev => {
      const kept: OutstandingCounts = {};
      for (const id of ids) {
        if (id in prev) kept[id] = prev[id];
      }
      return kept;
    });

    const unsubscribes = ids.map(listId =>
      onSnapshot(
        query(collection(db, 'lists', listId, 'items'), where('isPurchased', '==', false)),
        snapshot => {
          const outstanding = snapshot.docs.filter(d => d.data().isInLibrary !== true).length;
          setCounts(prev => (prev[listId] === outstanding ? prev : { ...prev, [listId]: outstanding }));
        },
        err => {
          console.error(`Could not count items for list ${listId}:`, err);
          setCounts(prev => (listId in prev ? prev : { ...prev, [listId]: 0 }));
        }
      )
    );

    return () => unsubscribes.forEach(unsub => unsub());
  }, [key]);

  return counts;
}

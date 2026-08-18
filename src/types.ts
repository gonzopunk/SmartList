import { Timestamp } from 'firebase/firestore';

export interface ShoppingList {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: Timestamp;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string; // Normalized
  originalName: string;
  category: string;
  isStaple: boolean;
  frequency?: 'staple' | 'as-needed' | 'occasional' | 'special';
  isPurchased: boolean;
  isInLibrary: boolean;
  quantity: string;
  addedBy: string;
  updatedAt: Timestamp;
}

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
  };
}

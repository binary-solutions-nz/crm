// Generic, type-safe CRUD helpers over Firestore so every collection page
// shares the same create/read/update/delete plumbing.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

export type WithId = { id: string };

// Strip the client-side `id` before writing; Firestore stores it as the doc key.
function stripId<T extends WithId>(data: Partial<T>): Record<string, unknown> {
  const { id: _omit, ...rest } = data as T;
  // Remove undefined values — Firestore rejects them.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}

export async function createDoc<T extends WithId>(
  path: string,
  data: Omit<T, 'id'>
): Promise<string> {
  const ref = doc(collection(db, path));
  await setDoc(ref, {
    ...stripId(data as Partial<T>),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return ref.id;
}

export async function updateDocById<T extends WithId>(
  path: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  const ref = doc(db, path, id);
  await updateDoc(ref, {
    ...stripId(data),
    updatedAt: Date.now(),
  });
}

export async function deleteDocById(path: string, id: string): Promise<void> {
  await deleteDoc(doc(db, path, id));
}

// One-shot fetch.
export async function fetchCollection<T extends WithId>(
  path: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = query(collection(db, path), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
}

// Realtime subscription. Returns an unsubscribe function.
export function subscribeCollection<T extends WithId>(
  path: string,
  onData: (rows: T[]) => void,
  onError: (err: Error) => void,
  ...constraints: QueryConstraint[]
): () => void {
  const q = query(collection(db, path), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
      onData(rows);
    },
    (err) => onError(err)
  );
}

// Re-export the query builders callers need so pages don't import firestore directly.
export { where, orderBy, serverTimestamp };

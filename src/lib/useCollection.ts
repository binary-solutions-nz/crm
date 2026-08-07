import { useEffect, useState } from 'react';
import type { QueryConstraint } from 'firebase/firestore';
import { subscribeCollection, type WithId } from './firestore';

interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

// Realtime collection hook. `deps` controls when the subscription is rebuilt
// (e.g. when a filter constraint changes). Constraints are passed as an array.
export function useCollection<T extends WithId>(
  path: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = []
): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const unsub = subscribeCollection<T>(
      path,
      (rows) => setState({ data: rows, loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: err.message }),
      ...constraints
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return state;
}

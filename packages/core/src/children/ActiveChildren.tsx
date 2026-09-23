import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChildSummary } from "@kidcom/shared";

import { useMe } from "../auth/hooks";
import { useChildren } from "./hooks";

// The header's child selector: which children the tab screens are showing.
// "all" (the default) or a single child. Remembered per account on this
// device so the app reopens on the same view.

export type ChildFilter = { kind: "all" } | { kind: "one"; childId: string };

type ActiveChildrenValue = {
  children: ChildSummary[];
  filter: ChildFilter;
  /** The children the current filter selects (all of them for "all"). */
  selected: ChildSummary[];
  selectAll: () => void;
  selectChild: (childId: string) => void;
  isLoading: boolean;
};

const ActiveChildrenContext = createContext<ActiveChildrenValue | null>(null);

const storageKey = (userId: string) => `kidcom.childFilter.${userId}`;

function readFilter(userId: string | undefined): ChildFilter {
  if (!userId) return { kind: "all" };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw && raw !== "all" ? { kind: "one", childId: raw } : { kind: "all" };
  } catch {
    return { kind: "all" };
  }
}

export function ActiveChildrenProvider({ children: node }: { children: ReactNode }) {
  const { data: me } = useMe();
  const { data: kids = [], isLoading } = useChildren();
  // Keyed by account: a different user signing in on this device starts
  // from their own remembered filter, never the previous account's.
  const [stored, setStored] = useState<{ userId: string | undefined; filter: ChildFilter }>(() => ({
    userId: me?.id,
    filter: readFilter(me?.id),
  }));
  const filter = stored.userId === me?.id ? stored.filter : readFilter(me?.id);

  const persist = useCallback(
    (next: ChildFilter) => {
      setStored({ userId: me?.id, filter: next });
      if (!me) return;
      try {
        localStorage.setItem(storageKey(me.id), next.kind === "all" ? "all" : next.childId);
      } catch {
        // Not persisted; still applied for this session.
      }
    },
    [me],
  );

  const value = useMemo<ActiveChildrenValue>(() => {
    // A remembered child that's gone (access removed, deleted) falls back to all.
    const effective: ChildFilter =
      filter.kind === "one" && !kids.some((k) => k.id === filter.childId) ? { kind: "all" } : filter;
    return {
      children: kids,
      filter: effective,
      selected: effective.kind === "all" ? kids : kids.filter((k) => k.id === effective.childId),
      selectAll: () => persist({ kind: "all" }),
      selectChild: (childId: string) => persist({ kind: "one", childId }),
      isLoading,
    };
  }, [filter, kids, isLoading, persist]);

  return <ActiveChildrenContext.Provider value={value}>{node}</ActiveChildrenContext.Provider>;
}

export function useActiveChildren(): ActiveChildrenValue {
  const ctx = useContext(ActiveChildrenContext);
  if (!ctx) throw new Error("useActiveChildren must be used inside <ActiveChildrenProvider>");
  return ctx;
}

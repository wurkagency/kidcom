import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChildSummary } from "@kinnd/shared";

import { useMe } from "../auth/hooks";
import { useChildren } from "./hooks";

// Which children the tab screens are showing: "all" (the default) or a
// chosen set — one child from the header's avatars, several from the
// Children screen. Remembered per account on this device so the app reopens
// on the same view.

export type ChildFilter = { kind: "all" } | { kind: "some"; childIds: string[] };

type ActiveChildrenValue = {
  children: ChildSummary[];
  filter: ChildFilter;
  /** The children the current filter selects (all of them for "all"). */
  selected: ChildSummary[];
  selectAll: () => void;
  /** Just this child. */
  selectChild: (childId: string) => void;
  /** Exactly these children (none or every one = all). */
  setSelection: (childIds: string[]) => void;
  isSelected: (childId: string) => boolean;
  isLoading: boolean;
};

const ActiveChildrenContext = createContext<ActiveChildrenValue | null>(null);

const storageKey = (userId: string) => `kinnd.childFilter.${userId}`;

function readFilter(userId: string | undefined): ChildFilter {
  if (!userId) return { kind: "all" };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const ids = raw && raw !== "all" ? raw.split(",").filter(Boolean) : [];
    return ids.length ? { kind: "some", childIds: ids } : { kind: "all" };
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
        localStorage.setItem(storageKey(me.id), next.kind === "all" ? "all" : next.childIds.join(","));
      } catch {
        // Not persisted; still applied for this session.
      }
    },
    [me],
  );

  const value = useMemo<ActiveChildrenValue>(() => {
    // Children that are gone (access removed, deleted) drop out; an empty or
    // complete selection means all.
    const normalize = (ids: string[]): ChildFilter => {
      const known = [...new Set(ids)].filter((id) => kids.some((k) => k.id === id));
      return known.length === 0 || known.length === kids.length ? { kind: "all" } : { kind: "some", childIds: known };
    };
    const effective = filter.kind === "all" || kids.length === 0 ? filter : normalize(filter.childIds);
    const selectedIds = effective.kind === "all" ? kids.map((k) => k.id) : effective.childIds;
    return {
      children: kids,
      filter: effective,
      selected: kids.filter((k) => selectedIds.includes(k.id)),
      selectAll: () => persist({ kind: "all" }),
      selectChild: (childId: string) => persist({ kind: "some", childIds: [childId] }),
      setSelection: (childIds: string[]) => persist(normalize(childIds)),
      isSelected: (childId: string) => effective.kind === "some" && effective.childIds.includes(childId),
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

import { useEffect, useState } from "react";
import type { ThreadSummaryDto } from "@kidcom/shared";

import { apiGet } from "./api";
import { useAuth } from "./AuthContext";

// Drives the notification-bell dot in Header.tsx — real data (the same
// `unread` flag MessagesPage.tsx's thread list already exposes), polled at
// the same 15s interval MessagesPage itself polls at, so the header doesn't
// invent a faster or slower notion of "fresh" than the screen it links to.
const POLL_MS = 15000;

export function useUnreadMessages(): boolean {
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasUnread(false);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const res = await apiGet<{ items: ThreadSummaryDto[] }>("/messages/threads");
        if (!cancelled) setHasUnread(res.items.some((t) => t.unread));
      } catch {
        // best-effort — a failed poll just leaves the last known state
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  return hasUnread;
}

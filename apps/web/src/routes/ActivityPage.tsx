import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CalendarEventRequestDto, SwapRequestDto, ThreadSummaryDto } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiGet, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

// The notification bell shown on every Aura tab-root screen has no
// dedicated results screen among the 20 mockups, and this app has no
// notification-log table to read from (see PRODUCT.md/schema — only
// NotificationPreferences and PushSubscription exist). Rather than invent
// fake notification rows, this aggregates the real things across a family
// that already are notification-worthy and already have real endpoints:
// pending swap requests, pending calendar-event requests (both per child),
// and unread message threads. Named "Activity" rather than "Notifications"
// to avoid colliding with /notifications, which is the existing delivery
// *settings* screen (NotificationSettingsPage.tsx) — a different concept.
type ActivityItem = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  createdAt: string;
  to: string;
};

export function ActivityPage() {
  const { children } = useAuth();
  useHeaderConfig({ title: "Activity", backTo: "/" }, []);

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (children.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      Promise.all(
        children.map((c) =>
          Promise.all([
            apiGet<{ items: SwapRequestDto[] }>(`/children/${c.id}/swap-requests`),
            apiGet<{ items: CalendarEventRequestDto[] }>(`/children/${c.id}/calendar-event-requests`),
          ]).then(([swaps, eventRequests]) => ({ child: c, swaps: swaps.items, eventRequests: eventRequests.items }))
        )
      ),
      apiGet<{ items: ThreadSummaryDto[] }>("/messages/threads"),
    ])
      .then(([perChild, threadsRes]) => {
        if (cancelled) return;
        const collected: ActivityItem[] = [];

        for (const { child, swaps, eventRequests } of perChild) {
          for (const swap of swaps.filter((s) => s.status === "PENDING")) {
            collected.push({
              id: `swap-${swap.id}`,
              icon: "swap_horiz",
              title: `Swap request for ${child.firstName}`,
              subtitle: swap.message || new Date(swap.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              createdAt: swap.createdAt,
              to: `/calendar?action=swap`,
            });
          }
          for (const req of eventRequests.filter((r) => r.status === "PENDING")) {
            collected.push({
              id: `event-request-${req.id}`,
              icon: "event",
              title: `"${req.title}" requested for ${child.firstName}`,
              subtitle: new Date(req.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              createdAt: req.createdAt,
              to: `/calendar`,
            });
          }
        }

        for (const thread of threadsRes.items.filter((t) => t.unread)) {
          const names = thread.members.map((m) => m.firstName).join(", ") || "Someone";
          collected.push({
            id: `thread-${thread.id}`,
            icon: "chat_bubble",
            title: `New message from ${names}`,
            subtitle: thread.lastMessage?.text || (thread.lastMessage?.mediaId ? "Sent a photo" : ""),
            createdAt: thread.lastMessage?.createdAt ?? new Date(0).toISOString(),
            to: `/messages/${thread.id}`,
          });
        }

        collected.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setItems(collected);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Couldn't load activity");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [children]);

  return (
    <div className="flex flex-col w-full px-container-padding pt-4 pb-32 gap-3">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="font-body-md text-body-md text-on-surface-variant">You're all caught up.</p>
      )}
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.to}
          className="bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm flex items-center gap-3"
        >
          <span className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container shrink-0">
            <Icon name={item.icon} className="text-[20px]" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-label-md text-label-md text-on-surface truncate">{item.title}</p>
            {item.subtitle && (
              <p className="font-body-sm text-body-sm text-on-surface-variant truncate">{item.subtitle}</p>
            )}
          </div>
          <Icon name="chevron_right" className="text-on-surface-variant shrink-0" />
        </Link>
      ))}
    </div>
  );
}

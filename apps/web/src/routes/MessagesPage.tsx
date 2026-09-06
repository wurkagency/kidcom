import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ThreadSummaryDto } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiGet, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

// No Stitch mockup exists for this screen (see chunk 6 plan notes). Thread
// list polls every ~15s — matches the architecture doc's polling-based
// realtime decision (no WebSockets/SSE).
const THREAD_LIST_POLL_MS = 15000;

export function MessagesPage() {
  const [threads, setThreads] = useState<ThreadSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useHeaderConfig(
    {
      title: "Messages",
      rightAction: (
        <Link
          to="/messages/new"
          aria-label="New message"
          className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center"
        >
          <Icon name="add" />
        </Link>
      ),
    },
    []
  );

  async function loadThreads() {
    try {
      const res = await apiGet<{ items: ThreadSummaryDto[] }>("/messages/threads");
      setThreads(res.items);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load messages");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThreads();
    const interval = setInterval(loadThreads, THREAD_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function threadTitle(thread: ThreadSummaryDto): string {
    if (thread.members.length === 0) return "Conversation";
    return thread.members.map((m) => m.firstName).join(", ");
  }

  return (
    <section className="px-container-padding pt-6 flex flex-col gap-section-margin">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
      {!loading && threads.length === 0 && (
        <p className="font-body-md text-body-md text-on-surface-variant">
          No conversations yet — tap + to message a co-parent or family member.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {threads.map((thread) => (
          <Link
            key={thread.id}
            to={`/messages/${thread.id}`}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-headline-md shrink-0">
              {threadTitle(thread).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-label-md text-label-md text-on-surface truncate">{threadTitle(thread)}</p>
              <p className="font-body-md text-body-md text-on-surface-variant truncate">
                {thread.lastMessage
                  ? thread.lastMessage.text ?? (thread.lastMessage.mediaId ? "📷 Photo" : "")
                  : "Say hello"}
              </p>
            </div>
            {thread.unread && <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />}
          </Link>
        ))}
      </div>
    </section>
  );
}

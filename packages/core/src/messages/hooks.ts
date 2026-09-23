import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  ChildFamilyMember,
  CreateMessageRequest,
  MessageDto,
  MessagesResponse,
  NotificationsResponse,
  SearchResponse,
  ThreadDto,
  ThreadSummaryDto,
} from "@kidcom/shared";

import { api } from "../api/client";
import { useFamilies } from "../calendar/hooks";
import { useChildren } from "../children/hooks";

// Conversations, the notification list and search. There's no socket: the
// inbox and an open thread poll, which is plenty for family logistics.

const enc = encodeURIComponent;
const THREADS_KEY = ["threads"] as const;
const threadKey = (id: string) => ["thread", id] as const;
const messagesKey = (id: string) => ["messages", id] as const;
const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useThreads() {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: async () => (await api.get<{ items: ThreadSummaryDto[] }>("/messages/threads")).items,
    refetchInterval: 20_000,
  });
}

/** Unread conversations, for the profile menu's badge. */
export function useUnreadThreadCount(): number {
  const { data } = useThreads();
  return (data ?? []).filter((t) => t.unreadCount > 0).length;
}

export function useThread(threadId: string | undefined) {
  return useQuery({
    queryKey: threadKey(threadId ?? ""),
    queryFn: () => api.get<ThreadDto>(`/messages/threads/${enc(threadId!)}`),
    enabled: Boolean(threadId),
  });
}

/** A thread's messages, oldest first; `fetchNextPage` loads older ones. Polls while open. */
export function useMessages(threadId: string | undefined) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: messagesKey(threadId ?? ""),
    enabled: Boolean(threadId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<MessagesResponse>(`/messages/threads/${enc(threadId!)}/messages${pageParam ? `?before=${enc(pageParam)}` : ""}`),
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.id ?? null : null),
    refetchInterval: 10_000,
  });
  // Reading a thread clears its unread badge.
  useEffect(() => {
    if (q.dataUpdatedAt) void qc.invalidateQueries({ queryKey: THREADS_KEY });
  }, [q.dataUpdatedAt, qc]);
  const messages = useMemo(() => [...(q.data?.pages ?? [])].reverse().flatMap((p) => p.items), [q.data]);
  return { ...q, messages };
}

export function useSendMessage(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMessageRequest) => api.post<MessageDto>(`/messages/threads/${enc(threadId)}/messages`, body),
    onSuccess: (msg) => {
      // Append to the newest page at once; the next poll confirms it.
      qc.setQueryData<InfiniteData<MessagesResponse, string | null>>(messagesKey(threadId), (data) =>
        data ? { ...data, pages: data.pages.map((p, i) => (i === 0 ? { ...p, items: [...p.items, msg] } : p)) } : data,
      );
      void qc.invalidateQueries({ queryKey: THREADS_KEY });
    },
  });
}

/** Opens (or reuses) the conversation with these people. */
export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberUserIds: string[]) => api.post<{ id: string }>("/messages/threads", { memberUserIds }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}

/** Everyone you share a child with — who you can message. */
export function useMessageablePeople(meId: string | undefined): ChildFamilyMember[] {
  const { data: children = [] } = useChildren();
  const families = useFamilies(children.map((c) => c.id));
  return useMemo(() => {
    const people = new Map<string, ChildFamilyMember>();
    for (const members of families.values()) for (const m of members) if (m.userId !== meId && !people.has(m.userId)) people.set(m.userId, m);
    return [...people.values()].sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [families, meId]);
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<NotificationsResponse>(`/notifications${pageParam ? `?cursor=${enc(pageParam)}` : ""}`),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
  });
}

/** For the header's bell dot. */
export function useUnreadNotificationCount(enabled = true): number {
  const { data } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "count"],
    queryFn: async () => (await api.get<NotificationsResponse>("/notifications")).unreadCount,
    refetchInterval: 60_000,
    enabled,
  });
  return data ?? 0;
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/notifications/read", {}),
    onSuccess: () => qc.setQueryData([...NOTIFICATIONS_KEY, "count"], 0),
  });
}

/** Search as you type (debounced; 2+ characters). */
export function useSearch(text: string) {
  const [q, setQ] = useState(text.trim());
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);
  const query = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<SearchResponse>(`/search?q=${enc(q)}`),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  });
  return { ...query, query: q };
}

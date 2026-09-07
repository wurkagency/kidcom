import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { CreateMessageRequest, MediaUploadResponse, MessageDto, ThreadDto } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { fetchMediaUrl } from "../lib/media";
import { apiGet, apiPost, apiUpload, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

const MESSAGE_POLL_MS = 4000;

function MessageMedia({ mediaId }: { mediaId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMediaUrl(mediaId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);
  if (!url) return <div className="w-40 h-40 rounded-lg bg-surface-container-high animate-pulse" />;
  return <img src={url} alt="" className="w-40 h-40 object-cover rounded-lg" />;
}

// No Stitch mockup exists for this screen (see chunk 6 plan notes). Polls
// every ~4s while mounted per the architecture doc's polling-based realtime
// decision.
export function MessageThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { user } = useAuth();

  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [thread, setThread] = useState<ThreadDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!threadId) return;
    try {
      const res = await apiGet<{ items: MessageDto[] }>(`/messages/threads/${threadId}/messages`);
      setMessages(res.items);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load this conversation");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, MESSAGE_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    apiGet<ThreadDto>(`/messages/threads/${threadId}`)
      .then((res) => {
        if (!cancelled) setThread(res);
      })
      .catch(() => {
        // Header falls back to "Conversation" below — not worth surfacing
        // as a page-level error.
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  function threadTitle(): string {
    if (!thread || thread.members.length === 0) return "Conversation";
    return thread.members.map((m) => m.firstName).join(", ");
  }

  useHeaderConfig({ title: thread ? threadTitle() : "Conversation", backTo: "/messages" }, [thread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const asset = await apiUpload<MediaUploadResponse>("/media/upload", formData);
      setPendingMedia(asset);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Upload failed — try again");
    } finally {
      setUploading(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!threadId || (!text.trim() && !pendingMedia)) return;
    setSending(true);
    try {
      const sent = await apiPost<MessageDto>(`/messages/threads/${threadId}/messages`, {
        text: text.trim() || undefined,
        mediaId: pendingMedia?.id,
      } satisfies CreateMessageRequest);
      setMessages((prev) => [...prev, sent]);
      setText("");
      setPendingMedia(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't send that — try again");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen">
      <div className="flex-1 px-container-padding py-4 flex flex-col gap-3 pb-32">
        {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}
        {!loading && messages.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">Say hello 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && (
                <Avatar name={m.senderName} avatarAssetId={m.senderAvatarUrl} kind="adult" size="xs" />
              )}
              <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 flex flex-col gap-2 ${
                    mine ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface"
                  }`}
                >
                  {m.mediaId && <MessageMedia mediaId={m.mediaId} />}
                  {m.text && <p className="font-body-md text-body-md">{m.text}</p>}
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                  {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="fixed bottom-0 inset-x-0 bg-surface p-container-padding pb-safe flex flex-col gap-2 border-t border-surface-variant/50"
      >
        {pendingMedia && (
          <div className="flex items-center gap-2 self-start bg-surface-container rounded-full px-3 py-1.5">
            <Icon name="image" className="text-[16px] text-primary" />
            <span className="font-label-sm text-label-sm text-on-surface-variant">Photo attached</span>
            <button type="button" onClick={() => setPendingMedia(null)}>
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-center">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant disabled:opacity-60 shrink-0"
          >
            <Icon name={uploading ? "hourglass_top" : "add_photo_alternate"} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            className="flex-1 bg-surface-container-lowest rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && !pendingMedia)}
            className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center disabled:opacity-60 shrink-0"
          >
            <Icon name="send" className="text-[20px]" />
          </button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MessageDto } from "@kinnd/shared";
import {
  addDays,
  dateKey,
  mediaDownloadUrl,
  mediaUrl,
  useCurrentUser,
  useFormat,
  useMessages,
  useNavigate,
  useParams,
  useSendMessage,
  useT,
  useThread,
  useUploadMedia,
} from "@kinnd/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { threadTitle } from "./InboxScreen";

// kinnd_calendar_5: the conversation. Day separators, received messages
// with the sender's photo and name, sent ones on the right in the mint
// bubble, photos as cards with their caption and a download button. No
// presence, calls or thread details (not built).

const GROUP_MS = 5 * 60 * 1000;

export function ThreadScreen() {
  const { t } = useT("messages");
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { data: thread } = useThread(threadId);
  const { messages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useMessages(threadId);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  // Keep the newest message in view as they arrive (not when loading older ones).
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  if (!threadId) return null;
  const first = thread?.members[0];

  return (
    <div className="flex flex-col w-full pb-16">
      <div className="-mx-margin px-margin py-2.5 mb-3 flex items-center justify-between border-b border-outline-variant/30 bg-surface/90 backdrop-blur-md sticky top-20 z-20">
        <div className="flex items-center gap-space-xs min-w-0">
          <button
            type="button"
            aria-label={t("back")}
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Icon name="arrow_back_ios_new" className="text-[20px]" />
          </button>
          {thread && (
            <div className="flex items-center gap-space-sm min-w-0">
              {thread.isGroup ? (
                <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-fixed">
                  <Icon name="groups" className="text-[20px]" />
                </div>
              ) : (
                <PersonAvatar mediaId={first?.avatarUrl} initials={`${first?.firstName.charAt(0) ?? ""}${first?.lastName.charAt(0) ?? ""}`} className="w-9 h-9" />
              )}
              <div className="flex flex-col min-w-0">
                <h1 className="font-title-md text-title-md text-on-surface truncate">{threadTitle(thread)}</h1>
                {thread.isGroup && <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{t("people", { count: thread.members.length + 1 })}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="self-center mb-space-sm px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"
        >
          {t("older")}
        </button>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-space-md mt-space-sm">
          <Skeleton className="h-20 w-3/4 rounded-lg bg-surface-container-lowest" />
          <Skeleton className="h-16 w-2/3 self-end rounded-lg bg-surface-container-lowest" />
        </div>
      ) : (
        <Stream messages={messages} />
      )}

      <Composer threadId={threadId} />
      <div ref={bottom} />
    </div>
  );
}

function DaySeparator({ day }: { day: string }) {
  const { t } = useT("messages");
  const fmt = useFormat();
  const date = fmt.date(`${day}T12:00:00Z`, { day: "numeric", month: "long", year: "numeric" });
  const label = day === dateKey() ? t("todayOn", { date }) : day === addDays(dateKey(), -1) ? t("yesterdayOn", { date }) : date;
  return (
    <div className="flex items-center justify-center my-space-xs">
      <span className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-micro-meta text-micro-meta uppercase tracking-wider">{label}</span>
    </div>
  );
}

function Stream({ messages }: { messages: MessageDto[] }) {
  const me = useCurrentUser();
  return (
    <div className="flex flex-col gap-space-md mt-space-sm">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || dateKey(prev.createdAt) !== dateKey(m.createdAt);
        const continued = !newDay && prev?.senderId === m.senderId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
        return (
          <div key={m.id} className="contents">
            {newDay && <DaySeparator day={dateKey(m.createdAt)} />}
            {m.senderId === me.id ? <Sent message={m} continued={continued} /> : <Received message={m} continued={continued} />}
          </div>
        );
      })}
    </div>
  );
}

function Attachment({ message, className, short }: { message: MessageDto; className?: string; short?: boolean }) {
  const { t } = useT("messages");
  if (!message.mediaId) return null;
  return (
    <div className={cn("bg-surface-container-lowest rounded-lg p-2.5 shadow-[0_4px_16px_rgba(22,26,24,0.05)] flex flex-col gap-2", className)}>
      <div className={cn("relative w-full rounded overflow-hidden", short ? "h-36" : "h-48")}>
        <img alt="" loading="lazy" src={mediaUrl(message.mediaId)} className="w-full h-full object-cover" />
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="font-label-md text-label-md text-on-surface truncate">{message.text ?? t("photo")}</span>
        <a
          href={mediaDownloadUrl(message.mediaId)}
          download
          aria-label={t("download")}
          className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors shrink-0"
        >
          <Icon name="arrow_downward" className="text-[18px]" />
        </a>
      </div>
    </div>
  );
}

function Received({ message, continued }: { message: MessageDto; continued: boolean }) {
  const fmt = useFormat();
  const first = message.senderName.split(" ")[0] ?? message.senderName;
  return (
    <article className="flex items-start gap-space-sm max-w-[92%]">
      <div className="w-8 shrink-0 mt-0.5">
        {!continued && <PersonAvatar mediaId={message.senderAvatarUrl} initials={first.charAt(0)} className="w-8 h-8 shadow-sm" />}
      </div>
      <div className="flex flex-col gap-space-xs min-w-0 flex-1">
        {!continued && (
          <div className="flex items-center gap-space-xs">
            <span className="font-label-md text-label-md text-on-surface">{first}</span>
            <span className="font-micro-meta text-micro-meta text-secondary">{fmt.time(message.createdAt)}</span>
          </div>
        )}
        {message.text && !message.mediaId && (
          <div className="bg-surface-container-lowest text-on-surface rounded-lg rounded-tl-none p-space-md shadow-[0_2px_12px_rgba(22,26,24,0.04)]">
            <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap break-words">{message.text}</p>
          </div>
        )}
        <Attachment message={message} className="mt-0.5" />
      </div>
    </article>
  );
}

function Sent({ message, continued }: { message: MessageDto; continued: boolean }) {
  const { t } = useT("messages");
  const fmt = useFormat();
  return (
    <article className="flex flex-col items-end gap-space-xs self-end max-w-[92%]">
      {!continued && (
        <div className="flex items-center gap-space-xs">
          <span className="font-micro-meta text-micro-meta text-secondary">{t("you")}</span>
          <span className="font-micro-meta text-micro-meta text-secondary">{fmt.time(message.createdAt)}</span>
        </div>
      )}
      {message.text && !message.mediaId && (
        <div className="bg-secondary-container text-on-secondary-fixed rounded-lg rounded-tr-none p-space-md shadow-[0_2px_12px_rgba(22,26,24,0.04)]">
          <p className="font-body-md text-body-md whitespace-pre-wrap break-words">{message.text}</p>
        </div>
      )}
      <Attachment message={message} className="w-full max-w-[280px]" short />
    </article>
  );
}

function Composer({ threadId }: { threadId: string }) {
  const { t } = useT("messages");
  const send = useSendMessage(threadId);
  const upload = useUploadMedia();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const busy = send.isPending || upload.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setError(false);
    send.mutate({ text: body }, { onSuccess: () => setText(""), onError: () => setError(true) });
  };

  // A photo goes out with whatever is typed as its caption.
  const attach = (file: File | undefined) => {
    if (!file) return;
    setError(false);
    upload.mutate(file, {
      onSuccess: (asset) =>
        send.mutate({ mediaId: asset.id, ...(text.trim() ? { text: text.trim() } : {}) }, { onSuccess: () => setText(""), onError: () => setError(true) }),
      onError: () => setError(true),
    });
  };

  return (
    <form onSubmit={submit} className="mt-space-lg flex flex-col gap-1">
      <div className="py-2 px-1 flex items-center gap-2 bg-surface-container-low/80 backdrop-blur-md rounded-2xl">
        <button
          type="button"
          aria-label={t("attach")}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
        >
          <Icon name={upload.isPending ? "hourglass_top" : "add"} className="text-[20px]" />
        </button>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
        <input
          aria-label={t("placeholder")}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          className="flex-1 min-w-0 h-10 px-space-sm rounded-full bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/70 font-body-md text-body-md focus:outline-none shadow-[0_2px_8px_rgba(22,26,24,0.04)]"
        />
        <button
          type="submit"
          aria-label={t("send")}
          disabled={busy || !text.trim()}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-primary text-on-primary shadow-sm active:scale-95 transition-all disabled:opacity-50"
        >
          <Icon name="send" className="text-[18px]" />
        </button>
      </div>
      {error && <p className="px-2 font-label-sm text-label-sm text-error">{t("failed")}</p>}
    </form>
  );
}

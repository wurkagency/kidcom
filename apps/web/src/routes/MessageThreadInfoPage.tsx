import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { MessageDto, ThreadDto } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiGet, ApiRequestError } from "../lib/api";
import { fetchMediaUrl } from "../lib/media";
import { useHeaderConfig } from "../lib/HeaderContext";

function SharedMediaThumb({ mediaId, onOpen }: { mediaId: string; onOpen: () => void }) {
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
  return (
    <button onClick={onOpen} className="aspect-square rounded-xl overflow-hidden bg-surface-container-high">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </button>
  );
}

// The mockups' message-thread header (docs/Themes/Aura/kidcom_calendar_5,
// misfiled under the calendar folder) has a "Thread Details" icon button
// with no destination screen among the 20 exported mockups. Built here from
// real data this app already has — the thread's real members and every
// real photo message already sent in it — rather than the mockup's implied
// but unspecified content. "Voice or Video Call", also in that header, is
// left out entirely: there's no calling infrastructure anywhere in this
// app to wire it to.
export function MessageThreadInfoPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [thread, setThread] = useState<ThreadDto | null>(null);
  const [sharedMedia, setSharedMedia] = useState<{ messageId: string; mediaId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useHeaderConfig({ title: "Thread Details", backTo: threadId ? `/messages/${threadId}` : "/messages" }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    Promise.all([
      apiGet<ThreadDto>(`/messages/threads/${threadId}`),
      apiGet<{ items: MessageDto[] }>(`/messages/threads/${threadId}/messages`),
    ])
      .then(([threadRes, messagesRes]) => {
        if (cancelled) return;
        setThread(threadRes);
        setSharedMedia(
          messagesRes.items
            .filter((m): m is MessageDto & { mediaId: string } => m.mediaId != null)
            .map((m) => ({ messageId: m.id, mediaId: m.mediaId }))
            .reverse()
        );
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't load this conversation"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (loading) {
    return <p className="px-container-padding pt-6 font-body-md text-body-md text-on-surface-variant">Loading…</p>;
  }
  if (error || !thread) {
    return (
      <p className="px-container-padding pt-6 font-body-md text-body-md text-error">{error ?? "Not found"}</p>
    );
  }

  return (
    <div className="flex flex-col w-full px-container-padding pt-6 pb-32 gap-section-margin">
      <section className="flex flex-col gap-2">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          {thread.members.length === 1 ? "Member" : "Members"}
        </h2>
        <div className="flex flex-col gap-2">
          {thread.members.map((member) => (
            <div key={member.userId} className="bg-surface-container-lowest rounded-2xl p-3.5 flex items-center gap-3">
              <Avatar name={`${member.firstName} ${member.lastName}`} avatarAssetId={member.avatarUrl} kind="adult" size="md" />
              <span className="font-label-md text-label-md text-on-surface">
                {member.firstName} {member.lastName}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Shared Media</h2>
        {sharedMedia.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">No photos shared yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sharedMedia.map((m) => (
              <SharedMediaThumb key={m.messageId} mediaId={m.mediaId} onOpen={() => navigate(`/messages/${threadId}`)} />
            ))}
          </div>
        )}
      </section>

      <button
        onClick={() => navigate(`/messages/${threadId}`)}
        className="mt-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md shadow-sm"
      >
        <Icon name="arrow_back" className="text-[18px]" />
        Back to conversation
      </button>
    </div>
  );
}

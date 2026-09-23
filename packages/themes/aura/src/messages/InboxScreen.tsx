import type { ThreadSummaryDto } from "@kidcom/shared";
import { Link, paths, useT, useThreads } from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { ScreenTitle } from "../components/ScreenTitle";
import { Skeleton } from "../ui/skeleton";
import { ListAvatar, ListRow, useListTime } from "./parts";

// kidcom_messages_1: every conversation, newest first; unread ones tinted
// with a count. Blocking and the "Kidcom" announcements row aren't built.

export function threadTitle(thread: Pick<ThreadSummaryDto, "members" | "isGroup">): string {
  if (!thread.isGroup) return thread.members[0]?.firstName ?? "";
  return thread.members.map((m) => m.firstName).join(", ");
}

export function InboxScreen() {
  const { t } = useT("messages");
  const { data: threads, isLoading } = useThreads();
  const when = useListTime();

  return (
    <div className="flex flex-col w-full pb-28">
      <ScreenTitle>{t("title")}</ScreenTitle>
      <div className="flex flex-col gap-2.5">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[82px] rounded-2xl bg-surface-container-lowest" />)}
        {!isLoading && (threads ?? []).length === 0 && <EmptyCard icon="forum" text={t("empty")} to={paths.messages.compose()} action={t("new")} />}
        {(threads ?? []).map((thread) => {
          const first = thread.members[0];
          const last = thread.lastMessage;
          return (
            <Link key={thread.id} to={paths.messages.thread(thread.id)} className="block active:scale-[0.99] transition-transform">
              <ListRow
                avatar={
                  thread.isGroup ? (
                    <ListAvatar icon="groups" />
                  ) : (
                    <ListAvatar mediaId={first?.avatarUrl} initials={`${first?.firstName.charAt(0) ?? ""}${first?.lastName.charAt(0) ?? ""}`} />
                  )
                }
                title={threadTitle(thread)}
                time={last ? when(last.createdAt) : ""}
                text={last ? last.text ?? t("photo") : t("noMessages")}
                unread={thread.unreadCount}
                italic={!last}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

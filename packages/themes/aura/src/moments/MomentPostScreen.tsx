import { useState, type FormEvent } from "react";
import type { ChildFamilyMember, CommentDto } from "@kidcom/shared";
import {
  paths,
  useAddComment,
  useChildFamily,
  useCurrentUser,
  useDeleteComment,
  useDeleteMoment,
  useFormat,
  useMoment,
  useMomentComments,
  useNavigate,
  useParams,
  useT,
} from "@kidcom/core";

import { EmptyCard, menuContentClass, menuItemClass } from "../calendar/Sections";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Skeleton } from "../ui/skeleton";
import { MomentCard } from "./MomentCard";

// kidcom_moments_feed_2: one moment with its location, then the comments
// and the "Write a warm comment…" composer. (No @mentions or attachments.)

const initials = (name: string) => name.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2);

export function MomentPostScreen() {
  const { t } = useT("moments");
  const navigate = useNavigate();
  const me = useCurrentUser();
  const { childId, momentId } = useParams();
  const { data: moment, isLoading, isError } = useMoment(childId, momentId);
  const { data: comments = [] } = useMomentComments(childId, momentId);
  const { data: members } = useChildFamily(childId);
  const remove = useDeleteMoment();
  const [confirming, setConfirming] = useState(false);

  if (isLoading) return <Skeleton className="w-full aspect-[4/5] rounded-lg bg-surface-container-lowest mt-6" />;
  if (isError || !moment || !childId) return <EmptyCard icon="photo_library" text={t("post.notFound")} to={paths.moments.feed()} action={t("post.backToFeed")} />;

  const mine = moment.authorId === me.id;

  return (
    <div className="flex flex-col w-full gap-space-lg">
      {mine && (
        <div className="flex justify-end -mb-3">
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t("post.actions")} className="w-9 h-9 rounded-full bg-surface-container-lowest shadow-[0_2px_8px_rgba(22,26,24,0.06)] flex items-center justify-center text-on-surface">
              <Icon name="more_horiz" className="text-[20px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn(menuContentClass, "w-44")}>
              <DropdownMenuItem className={menuItemClass} onSelect={() => navigate(`${paths.moments.create()}?edit=${moment.id}&child=${childId}`)}>
                <Icon name="edit" className="text-[16px] text-secondary" />
                {t("post.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem className={cn(menuItemClass, "text-error focus:text-error")} onSelect={() => setConfirming(true)}>
                <Icon name="delete" className="text-[16px]" />
                {t("post.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <MomentCard moment={moment} members={members} detail />

      <section className="flex flex-col gap-space-md mt-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">{t("comments.title")}</h3>
          </div>
        </div>
        <div className="flex flex-col gap-space-sm">
          {comments.map((c) => (
            <CommentCard key={c.id} comment={c} childId={childId} momentId={moment.id} members={members} mine={c.authorId === me.id} />
          ))}
        </div>
        <Composer childId={childId} momentId={moment.id} />
      </section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("post.confirmDelete")}
        body={t("post.confirmDeleteBody")}
        confirmLabel={t("post.delete")}
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ childId, momentId: moment.id }, { onSuccess: () => navigate(paths.moments.feed(), { replace: true }) })}
      />
    </div>
  );
}

function CommentCard({
  comment,
  childId,
  momentId,
  members,
  mine,
}: {
  comment: CommentDto;
  childId: string;
  momentId: string;
  members: ChildFamilyMember[] | undefined;
  mine: boolean;
}) {
  const { t } = useT("moments");
  const fmt = useFormat();
  const remove = useDeleteComment(childId, momentId);
  const m = members?.find((x) => x.userId === comment.authorId);
  // "Mormor Inger" for family, the first name for parents (as the export writes it).
  const name = !m
    ? comment.authorName.split(" ")[0]
    : ["FATHER", "MOTHER", "STEP_FATHER", "STEP_MOTHER", "PARENT"].includes(m.relationship)
      ? m.firstName
      : t("commentAuthor", { relationship: t(`calendar:people.relationship.${m.relationship}`), name: m.firstName });

  return (
    <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PersonAvatar mediaId={comment.authorAvatarUrl} initials={initials(comment.authorName)} className="w-7 h-7" />
          <div className="flex items-center gap-1.5">
            <span className="font-label-md text-on-surface font-semibold">{name}</span>
          </div>
        </div>
        <span className="font-label-sm text-secondary text-xs">{fmt.relative(comment.createdAt)}</span>
      </div>
      <p className="font-body-md text-on-surface leading-relaxed pl-9 whitespace-pre-line">{comment.text}</p>
      {mine && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(comment.id)}
            className="text-on-surface-variant hover:text-error flex items-center gap-1 text-xs"
          >
            <Icon name="delete" className="text-[14px]" />
            {t("comments.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

function Composer({ childId, momentId }: { childId: string; momentId: string }) {
  const { t } = useT("moments");
  const me = useCurrentUser();
  const add = useAddComment(childId, momentId);
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    add.mutate(text.trim(), { onSuccess: () => setText("") });
  };
  return (
    <form onSubmit={submit} className="bg-surface-container-lowest rounded-full p-1.5 pl-2 pr-1.5 shadow-[0_2px_12px_rgba(22,26,24,0.06)] flex items-center gap-2 mt-2">
      <PersonAvatar mediaId={me.avatarUrl} initials={`${me.firstName.charAt(0)}${me.lastName.charAt(0)}`} className="w-8 h-8 shrink-0" />
      <div className="flex-1 bg-surface-container-low rounded-full px-3.5 py-1.5 flex items-center justify-between gap-2">
        <input
          aria-label={t("comments.placeholder")}
          placeholder={t("comments.placeholder")}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-body-md text-on-surface placeholder:text-on-surface-variant/60 font-body-md min-w-0"
        />
      </div>
      <button
        type="submit"
        aria-label={t("comments.send")}
        disabled={add.isPending || !text.trim()}
        className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-60"
      >
        <Icon name="send" className="text-[16px]" />
      </button>
    </form>
  );
}

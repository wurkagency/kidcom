import { useState, type ReactNode } from "react";
import type { CategoryDto, ChildFamilyMember, ChildNoteDto, SchoolLessonDto, SwapRequestDto, TaskDto } from "@kinnd/shared";
import {
  dateKey,
  Link,
  paths,
  useCurrentUser,
  useDeleteNote,
  useFormat,
  useNavigate,
  useResolveSwap,
  useT,
  useToggleTask,
} from "@kinnd/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { CategoryChip } from "./CategoryChip";
import { findMember, usePersonName, usePersonWithRelationship } from "./people";
import { toneOf } from "./tones";

// The lower sections shared by Today and every calendar view, ported from
// kinnd_calendar_1-3: section headers with a count pill, the swap-request
// card, the school routine reminder, Reminders & Tasks, and Notes.

export const menuContentClass =
  "rounded-2xl bg-surface-container-lowest p-1.5 shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)] border border-outline-variant/30 flex flex-col gap-0.5";
export const menuItemClass =
  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-label-sm font-medium text-on-surface focus:bg-surface-container-low";

/** "Appointments  (3 scheduled)" */
export function SectionHeader({ title, count, semibold = true }: { title: ReactNode; count?: ReactNode; semibold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className={cn("font-title-md text-title-md text-on-surface", semibold && "font-semibold")}>{title}</span>
      </div>
      {count !== undefined && (
        <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-secondary font-label-sm text-label-sm">{count}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swap request card (peach, "Approve for June 7" / "Discuss")
// ---------------------------------------------------------------------------

export function SwapCard({
  swap,
  childId,
  members,
  canApprove,
}: {
  swap: SwapRequestDto;
  childId: string;
  members: ChildFamilyMember[];
  canApprove: boolean;
}) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const me = useCurrentUser();
  const name = usePersonWithRelationship();
  const resolve = useResolveSwap(childId);
  const from = findMember(members, swap.requestedById);
  const mine = swap.requestedById === me.id;
  const day = fmt.date(`${swap.date}T12:00:00Z`, { month: "long", day: "numeric" });

  return (
    <section className="p-space-lg rounded-[28px] bg-peach shadow-[0_6px_20px_rgba(0,0,0,0.04)] flex flex-col gap-space-md">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-space-sm flex-1">
          <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 border border-outline-variant/30 shadow-sm">
            <PersonAvatar
              mediaId={from?.avatarUrl}
              initials={from ? `${from.firstName.charAt(0)}${from.lastName.charAt(0)}` : "?"}
              className="size-full"
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-title-md text-title-md text-on-surface">{t("swap.title")}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold shrink-0">
                {t("swap.awaiting")}
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-secondary">
              {mine ? t("swap.sentByYou", { date: day }) : t("swap.from", { name: name(from) })}
            </span>
          </div>
        </div>
      </div>
      {swap.message && <p className="font-body-md text-body-md text-on-surface-variant">{swap.message}</p>}
      <div className="flex items-center gap-space-xs pt-1">
        {!mine && canApprove && (
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ swapId: swap.id, status: "APPROVED" })}
            className="flex-1 py-3 px-4 rounded-full bg-apricot text-black font-label-md text-label-md hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {t("swap.approveFor", { date: day })}
          </button>
        )}
        <Link
          to={paths.messages.compose()}
          className={cn(
            "py-3 px-4 rounded-full bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all text-center",
            (mine || !canApprove) && "flex-1",
          )}
        >
          {t("swap.discuss")}
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// School routine reminder ("Gym gear required Wed & Fri")
// ---------------------------------------------------------------------------

export function SchoolReminder({ lessons }: { lessons: SchoolLessonDto[] }) {
  const { t, i18n } = useT("calendar");
  const fmt = useFormat();
  const withBring = lessons.filter((l) => l.bring);
  if (withBring.length === 0) return null;

  // Group "what to bring" by item, listing its weekdays: "Gym gear" → Wed & Fri.
  const byItem = new Map<string, Set<number>>();
  for (const l of withBring) {
    const key = l.bring!.trim();
    byItem.set(key, (byItem.get(key) ?? new Set()).add(l.weekday));
  }
  // 2026-09-21 is a Monday; weekday n → that week's date, for the short name.
  const dayName = (weekday: number) => fmt.date(`2026-09-${String(20 + weekday).padStart(2, "0")}T12:00:00Z`, { weekday: "short" });
  const listFormat = new Intl.ListFormat(i18n.language, { style: "short", type: "conjunction" });
  const [item, days] = [...byItem.entries()][0]!;

  return (
    <Link to={paths.calendar.school()} className="p-space-md rounded-[24px] bg-surface-container-lowest shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
          <Icon name="backpack" className="text-[18px]" />
        </div>
        <div className="flex flex-col">
          <span className="font-label-md text-label-md text-on-surface">{t("school.reminderTitle")}</span>
          <span className="font-body-md text-body-md text-secondary">
            {t("school.reminderBody", { item, days: listFormat.format([...days].sort().map(dayName)) })}
          </span>
        </div>
      </div>
      <Icon name="notifications_active" className="text-[20px] text-secondary" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Reminders & Tasks
// ---------------------------------------------------------------------------

export function TasksSection({ tasks, categories }: { tasks: TaskDto[]; categories: Map<string, CategoryDto> }) {
  const { t } = useT("calendar");
  const remaining = tasks.filter((x) => !x.completedAt).length;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t("tasks.title")} count={t("tasks.remaining", { count: remaining })} />
      {tasks.length === 0 ? (
        <EmptyCard icon="checklist" text={t("tasks.empty")} to={paths.tasks.create()} action={t("tasks.add")} />
      ) : (
        <div className="rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 flex flex-col divide-y divide-outline-variant/20">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} category={task.categoryId ? categories.get(task.categoryId) : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, category }: { task: TaskDto; category: CategoryDto | undefined }) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const toggle = useToggleTask(task.childId);
  const [open, setOpen] = useState(false);
  const done = task.completedAt !== null;

  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-1">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Checkbox
          aria-label={t("tasks.complete")}
          checked={done}
          onCheckedChange={(v) => toggle.mutate({ taskId: task.id, completed: v === true })}
          className="mt-0.5 size-5 rounded-full border-2 border-outline/30 bg-transparent hover:border-primary data-[state=checked]:border-secondary/40 data-[state=checked]:bg-secondary/40 transition-colors"
        />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={cn(
              "text-left font-body-md text-sm font-medium leading-snug",
              done ? "line-through opacity-60 text-secondary" : "text-on-surface",
            )}
          >
            {task.title}
          </button>
          {/* The export keeps this meta row even when empty (its gap is part of the row height). */}
          <div className="flex items-center gap-2 flex-wrap text-label-sm text-secondary">
            {open && task.note && <span className="text-[12px] text-outline">{task.note}</span>}
            {open && task.dueOn && <span className="text-[12px] text-outline">{t("tasks.due", { date: fmt.weekdayDate(`${task.dueOn}T12:00:00Z`) })}</span>}
          </div>
          {open && category && <CategoryChip category={category} className="w-fit mt-1.5" />}
          {open && (
            <Link
              to={`${paths.tasks.create()}?child=${encodeURIComponent(task.childId)}&task=${encodeURIComponent(task.id)}`}
              className="w-fit mt-1 font-label-sm text-label-sm text-on-surface underline decoration-secondary underline-offset-4"
            >
              {t("tasks.editLink")}
            </Link>
          )}
        </div>
      </div>
      <button type="button" aria-label={t(open ? "tasks.collapse" : "tasks.expand")} onClick={() => setOpen(!open)} className="shrink-0 mt-0.5 flex">
        <Icon name="expand_more" className={cn("text-[20px] text-secondary transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function NotesSection({
  today,
  notes,
  categories,
  membersFor,
}: {
  today: string;
  notes: ChildNoteDto[];
  categories: Map<string, CategoryDto>;
  membersFor: (childId: string) => ChildFamilyMember[];
}) {
  const { t } = useT("calendar");
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t("notes.title")} count={t("notes.count", { count: notes.length })} />
      {notes.length === 0 ? (
        <EmptyCard icon="sticky_note_2" text={t("notes.empty")} to={paths.notes.create()} action={t("notes.add")} />
      ) : (
        <div className="flex flex-col gap-3">
          {[...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((note) => (
            <NoteCard
              today={today}
              key={note.id}
              note={note}
              category={note.categoryId ? categories.get(note.categoryId) : undefined}
              members={membersFor(note.childId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function NoteCard({ today, note, category, members }: { today: string; note: ChildNoteDto; category: CategoryDto | undefined; members: ChildFamilyMember[] }) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const me = useCurrentUser();
  const person = usePersonName();
  const navigate = useNavigate();
  const remove = useDeleteNote(note.childId);
  const tone = toneOf(category?.tone ?? "SAGE");
  const mine = note.authorUserId === me.id;
  const author = findMember(members, note.authorUserId);

  return (
    <div className={cn("relative overflow-hidden p-4 rounded-2xl border shadow-[0_1px_6px_rgba(0,0,0,0.02)] flex flex-col gap-2", tone.noteCard)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon name={category?.icon ?? "sticky_note_2"} className={cn("text-[16px]", tone.ink)} />
          <h4 className="font-title-md text-title-md text-on-surface font-semibold truncate">{note.title}</h4>
        </div>
        {mine && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t("notes.actions")} className="shrink-0">
              <Icon name="more_horiz" className="text-[18px] text-secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn(menuContentClass, "w-40")}>
              <DropdownMenuItem className={menuItemClass} onSelect={() => navigate(`${paths.notes.create()}?child=${encodeURIComponent(note.childId)}&note=${encodeURIComponent(note.id)}`)}>
                <Icon name="edit" className="text-[16px] text-secondary" />
                {t("notes.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem className={cn(menuItemClass, "text-error focus:text-error")} onSelect={() => remove.mutate(note.id)}>
                <Icon name="delete" className="text-[16px]" />
                {t("notes.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {note.text && <p className="font-body-md text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">{note.text}</p>}
      <div className="flex items-center gap-2 text-micro-meta text-secondary font-medium pt-1 border-t border-outline-variant/20">
        <Icon name="schedule" className="text-[14px]" />
        <span>
          {t(mine ? "notes.metaMine" : "notes.metaShared", {
            when: `${dateKey(note.createdAt) === today ? t("notes.today") : fmt.weekdayDate(note.createdAt)}, ${fmt.time(note.createdAt)}`,
            name: person(author),
          })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state card (DESIGN.md: white card, secondary text, one text action)
// ---------------------------------------------------------------------------

export function EmptyCard({ icon, text, to, action }: { icon: string; text: string; to?: string; action?: string }) {
  return (
    <div className="rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary shrink-0">
        <Icon name={icon} className="text-[18px]" />
      </div>
      <span className="font-body-md text-body-md text-secondary flex-1">{text}</span>
      {to && action && (
        <Link to={to} className="font-label-md text-label-md text-on-surface underline decoration-secondary underline-offset-4 shrink-0">
          {action}
        </Link>
      )}
    </div>
  );
}

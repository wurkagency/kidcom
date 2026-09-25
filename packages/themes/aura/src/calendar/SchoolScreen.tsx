import { useState, type FormEvent } from "react";
import type { SchoolLessonDto } from "@kinnd/shared";
import {
  dateKey,
  isoWeekday,
  useActiveChildren,
  useCreateLesson,
  useDeleteLesson,
  useFormat,
  useSchoolLessons,
  useT,
  useUpdateLesson,
} from "@kinnd/core";

import { Field, FormError, PrimaryButton, SecondaryButton } from "../components/Form";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { CalendarTitle } from "./CalendarScreen";
import { EmptyCard } from "./Sections";
import { LessonRow } from "./TodayScreen";

// The School view of the calendar dropdown ("See full schema" on Today):
// the weekly timetable per weekday, in the Today screen's School card, with
// a DESIGN.md sheet to add or change a lesson.

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
// 2026-09-21 is a Monday: weekday n → a date for its localized name.
const weekdayDate = (n: number) => `2026-09-${String(20 + n).padStart(2, "0")}T12:00:00Z`;

const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";

export function SchoolScreen() {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const { selected: kids } = useActiveChildren();
  const [picked, setChildId] = useState<string | null>(null);
  const childId = kids.some((k) => k.id === picked) ? picked! : (kids[0]?.id ?? "");
  const today = isoWeekday(dateKey());
  const [weekday, setWeekday] = useState(today > 5 ? 1 : today);
  const { data: lessons = [], isLoading } = useSchoolLessons(childId || undefined);
  const [editing, setEditing] = useState<SchoolLessonDto | "new" | null>(null);

  // Weekends appear only when something is scheduled on them.
  const days = WEEKDAYS.filter((d) => d <= 5 || lessons.some((l) => l.weekday === d));
  const dayLessons = lessons.filter((l) => l.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <CalendarTitle title={t("views.school")} view="school" selected={dateKey()} />

      {kids.length > 1 && (
        <ToggleGroup type="single" spacing={1} value={childId} onValueChange={(v) => v && setChildId(v)} className={segmentedGroup} aria-label={t("form.child")}>
          {kids.map((k) => (
            <ToggleGroupItem key={k.id} value={k.id} variant="segmented" className="flex-1 h-9">
              {k.firstName}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <ToggleGroup type="single" spacing={1} value={String(weekday)} onValueChange={(v) => v && setWeekday(Number(v))} className={segmentedGroup} aria-label={t("school.weekday")}>
        {days.map((d) => (
          <ToggleGroupItem key={d} value={String(d)} variant="segmented" className="flex-1 h-9 px-1">
            {fmt.date(weekdayDate(d), { weekday: "short" })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <section className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-1">
          <span className="font-title-md text-title-md text-on-surface">{fmt.date(weekdayDate(weekday), { weekday: "long" })}</span>
        </div>
        {!isLoading && dayLessons.length === 0 ? (
          <EmptyCard icon="school" text={t("school.noLessons")} />
        ) : (
          <div className="bg-surface-container-lowest rounded-[26px] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-outline-variant/20">
            {dayLessons.map((l) => (
              <button key={l.id} type="button" onClick={() => setEditing(l)} className="text-left py-3 first:pt-0 last:pb-0">
                <LessonRow lesson={l} className="flex items-center justify-between gap-3" />
              </button>
            ))}
          </div>
        )}
      </section>

      <PrimaryButton type="button" icon="add" disabled={!childId} onClick={() => setEditing("new")}>
        {t("school.addLesson")}
      </PrimaryButton>

      {childId && (
        <LessonSheet
          key={editing === "new" ? "new" : (editing?.id ?? "closed")}
          childId={childId}
          lesson={editing}
          defaultWeekday={weekday}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LessonSheet({
  childId,
  lesson,
  defaultWeekday,
  onClose,
}: {
  childId: string;
  lesson: SchoolLessonDto | "new" | null;
  defaultWeekday: number;
  onClose: () => void;
}) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const existing = lesson && lesson !== "new" ? lesson : null;
  const [weekday, setWeekday] = useState(String(existing?.weekday ?? defaultWeekday));
  const [start, setStart] = useState(existing?.startTime ?? "08:00");
  const [end, setEnd] = useState(existing?.endTime ?? "");
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [room, setRoom] = useState(existing?.room ?? "");
  const [bring, setBring] = useState(existing?.bring ?? "");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateLesson(childId);
  const update = useUpdateLesson(childId);
  const remove = useDeleteLesson(childId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) return setError(t("school.subjectRequired"));
    if (end && end <= start) return setError(t("form.endAfterStart"));
    const body = {
      weekday: Number(weekday),
      startTime: start,
      endTime: end || null,
      subject: subject.trim(),
      room: room.trim() || null,
      bring: bring.trim() || null,
    };
    const done = { onSuccess: onClose, onError: (err: unknown) => setError(err instanceof Error ? err.message : t("form.saveFailed")) };
    if (existing) update.mutate({ lessonId: existing.id, body }, done);
    else create.mutate(body, done);
  };

  return (
    <Sheet open={lesson !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg max-h-[90vh] overflow-y-auto">
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t(existing ? "school.editLesson" : "school.addLesson")}</SheetTitle>
          <SheetDescription className="sr-only">{t("school.lessonDescription")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field id="subject" label={t("school.subject")}>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("school.subjectPlaceholder")} />
          </Field>
          <Field id="weekday" label={t("school.weekday")}>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger id="weekday" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {fmt.date(weekdayDate(d), { weekday: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="start" label={t("form.start")}>
              <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field id="end" label={t("form.end")}>
              <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <Field id="room" label={t("school.room")}>
            <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t("school.roomPlaceholder")} />
          </Field>
          <Field id="bring" label={t("school.bring")} hint={t("school.bringHint")}>
            <Input id="bring" value={bring} onChange={(e) => setBring(e.target.value)} placeholder={t("school.bringPlaceholder")} />
          </Field>
          <FormError message={error} />
          <PrimaryButton icon="check" disabled={create.isPending || update.isPending}>
            {t(existing ? "form.saveChanges" : "school.addLesson")}
          </PrimaryButton>
          {existing && (
            <SecondaryButton
              icon="delete"
              className="text-error"
              disabled={remove.isPending}
              onClick={() => remove.mutate(existing.id, { onSuccess: onClose })}
            >
              {t("school.deleteLesson")}
            </SecondaryButton>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

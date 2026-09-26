import { useState, type FormEvent } from "react";
import type { ChildNoteDto, TaskDto } from "@kinnd/shared";
import { toast } from "sonner";
import {
  dateKey,
  useActiveChildren,
  useChildNotes,
  useChildTasks,
  useCreateNote,
  useCreateSwap,
  useCreateTask,
  useDeleteNote,
  useDeleteTask,
  useFormat,
  useNavigate,
  useSearchParams,
  useT,
  useUpdateNote,
  useUpdateTask,
} from "@kinnd/core";

import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  CategoriesField,
  ChildField,
  DateField,
  EditorTitle,
  Field,
  FormCard,
  FormError,
  PrimaryButton,
  SecondaryButton,
} from "../components/Form";
import { Calendar } from "../ui/calendar";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";

// Swap request, shared note and task editors (no Stitch exports; DESIGN.md
// form parts). All take ?child= (and ?note= / ?task= to edit).

/** The child from ?child=, else the header's selection, else the first child. */
function useTargetChild() {
  const [params] = useSearchParams();
  const { children: kids, selected } = useActiveChildren();
  const [picked, setChildId] = useState<string | null>(null);
  const childId = picked ?? params.get("child") ?? selected[0]?.id ?? kids[0]?.id ?? "";
  return { kids, childId, setChildId, params };
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// ---------------------------------------------------------------------------
// Swap request
// ---------------------------------------------------------------------------

export function SwapRequestScreen() {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const navigate = useNavigate();
  const { kids, childId, setChildId, params } = useTargetChild();
  const [day, setDay] = useState(params.get("date") ?? dateKey());
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSwap(childId);
  const selected = new Date(`${day}T12:00:00`);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      { date: day, ...(message.trim() ? { message: message.trim() } : {}) },
      {
        onSuccess: () => {
          toast(t("swap.sent"));
          navigate(-1);
        },
        onError: (err) => setError(errorText(err, t("form.saveFailed"))),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col w-full pb-6 gap-space-lg" noValidate>
      <EditorTitle>{t("swap.request")}</EditorTitle>
      <p className="font-body-md text-body-md text-secondary -mt-4">{t("swap.intro")}</p>
      <FormCard>
        <ChildField kids={kids} value={childId} onChange={setChildId} />
        <Field label={t("swap.dayLabel")} hint={fmt.date(`${day}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })}>
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={{ before: new Date() }}
            onSelect={(d) => d && setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)}
          />
        </Field>
        <Field id="message" label={t("swap.messageLabel")}>
          <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("swap.messagePlaceholder")} />
        </Field>
      </FormCard>
      <FormError message={error} />
      <PrimaryButton icon="sync_alt" disabled={create.isPending || !childId}>
        {t("swap.send")}
      </PrimaryButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared note
// ---------------------------------------------------------------------------

export function NoteEditScreen() {
  const { t } = useT("calendar");
  const target = useTargetChild();
  const noteId = target.params.get("note");
  const { data: notes, isLoading } = useChildNotes(noteId ? target.childId : undefined);
  const existing = notes?.find((n) => n.id === noteId);
  if (noteId && !existing) return <EditorTitle>{t(isLoading ? "common:loading" : "notes.notFound")}</EditorTitle>;
  return <NoteForm key={existing?.id ?? "new"} target={target} noteId={noteId} existing={existing} />;
}

type Target = ReturnType<typeof useTargetChild>;

function NoteForm({ target, noteId, existing }: { target: Target; noteId: string | null; existing?: ChildNoteDto }) {
  const { t } = useT("calendar");
  const navigate = useNavigate();
  const { kids, childId, setChildId } = target;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [text, setText] = useState(existing?.text ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(existing?.categoryIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const create = useCreateNote(childId);
  const update = useUpdateNote(childId);
  const remove = useDeleteNote(childId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t("form.titleRequired"));
    const body = { title: title.trim(), text: text.trim() || null, categoryIds };
    const done = { onSuccess: () => navigate(-1), onError: (err: unknown) => setError(errorText(err, t("form.saveFailed"))) };
    if (noteId) update.mutate({ noteId, body }, done);
    else create.mutate(body, done);
  };

  return (
    <form onSubmit={submit} className="flex flex-col w-full pb-6 gap-space-lg" noValidate>
      <EditorTitle>{t(noteId ? "notes.editTitle" : "notes.createTitle")}</EditorTitle>
      <FormCard>
        {!noteId && <ChildField kids={kids} value={childId} onChange={setChildId} />}
        <Field id="title" label={t("form.title")}>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("notes.titlePlaceholder")} />
        </Field>
        <Field id="text" label={t("notes.text")}>
          <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("notes.textPlaceholder")} className="min-h-32" />
        </Field>
        <CategoriesField value={categoryIds} onChange={setCategoryIds} />
      </FormCard>
      <FormError message={error} />
      <PrimaryButton icon="check" disabled={create.isPending || update.isPending || !childId}>
        {t(noteId ? "form.saveChanges" : "notes.share")}
      </PrimaryButton>
      {noteId && (
        <>
          <SecondaryButton icon="delete" className="text-error" onClick={() => setConfirming(true)}>
            {t("notes.delete")}
          </SecondaryButton>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("notes.confirmDelete")}
            confirmLabel={t("notes.delete")}
            pending={remove.isPending}
            onConfirm={() => remove.mutate(noteId, { onSuccess: () => navigate(-1) })}
          />
        </>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export function TaskEditScreen() {
  const { t } = useT("calendar");
  const target = useTargetChild();
  const taskId = target.params.get("task");
  const { data: tasks, isLoading } = useChildTasks(taskId ? target.childId : undefined);
  const existing = tasks?.find((x) => x.id === taskId);
  if (taskId && !existing) return <EditorTitle>{t(isLoading ? "common:loading" : "tasks.notFound")}</EditorTitle>;
  return <TaskForm key={existing?.id ?? "new"} target={target} taskId={taskId} existing={existing} />;
}

function TaskForm({ target, taskId, existing }: { target: Target; taskId: string | null; existing?: TaskDto }) {
  const { t } = useT("calendar");
  const navigate = useNavigate();
  const { kids, childId, setChildId, params } = target;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(existing?.categoryIds ?? []);
  const [hasDue, setHasDue] = useState(existing ? Boolean(existing.dueOn) : Boolean(params.get("date")));
  const [dueOn, setDueOn] = useState(existing?.dueOn ?? params.get("date") ?? dateKey());
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const create = useCreateTask(childId);
  const update = useUpdateTask(childId);
  const remove = useDeleteTask(childId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t("form.titleRequired"));
    const body = { title: title.trim(), note: note.trim() || null, categoryIds, dueOn: hasDue ? dueOn : null };
    const done = { onSuccess: () => navigate(-1), onError: (err: unknown) => setError(errorText(err, t("form.saveFailed"))) };
    if (taskId) update.mutate({ taskId, body }, done);
    else create.mutate(body, done);
  };

  return (
    <form onSubmit={submit} className="flex flex-col w-full pb-6 gap-space-lg" noValidate>
      <EditorTitle>{t(taskId ? "tasks.editTitle" : "tasks.createTitle")}</EditorTitle>
      <FormCard>
        {!taskId && <ChildField kids={kids} value={childId} onChange={setChildId} />}
        <Field id="title" label={t("form.title")}>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("tasks.titlePlaceholder")} />
        </Field>
        <Field id="note" label={t("tasks.note")}>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("tasks.notePlaceholder")} />
        </Field>
        <CategoriesField value={categoryIds} onChange={setCategoryIds} />
      </FormCard>
      <FormCard>
        <label className="flex items-center justify-between gap-3">
          <span className="font-label-md text-label-md text-on-surface">{t("tasks.hasDue")}</span>
          <Switch checked={hasDue} onCheckedChange={setHasDue} />
        </label>
        {hasDue && <DateField id="due" label={t("tasks.dueLabel")} value={dueOn} onChange={setDueOn} />}
      </FormCard>
      <FormError message={error} />
      <PrimaryButton icon="check" disabled={create.isPending || update.isPending || !childId}>
        {t(taskId ? "form.saveChanges" : "tasks.create")}
      </PrimaryButton>
      {taskId && (
        <>
          <SecondaryButton icon="delete" className="text-error" onClick={() => setConfirming(true)}>
            {t("tasks.delete")}
          </SecondaryButton>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("tasks.confirmDelete")}
            confirmLabel={t("tasks.delete")}
            pending={remove.isPending}
            onConfirm={() => remove.mutate(taskId, { onSuccess: () => navigate(-1) })}
          />
        </>
      )}
    </form>
  );
}

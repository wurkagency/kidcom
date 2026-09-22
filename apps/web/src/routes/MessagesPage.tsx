import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  CreatePersonalNoteRequest,
  NoteCategory,
  PersonalNoteDto,
  ThreadSummaryDto,
  UpdatePersonalNoteRequest,
} from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { apiFetch, apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

// Matches docs/stitch_splitkid/messages_personal_notes/code.html: one screen
// with a pill-tab switcher between Conversations and Personal Notes, rather
// than two separate screens. Tab state lives in the URL (?tab=notes) so
// /notes can redirect here with the right tab pre-selected (see App.tsx).
const THREAD_LIST_POLL_MS = 15000;

const CATEGORY_META: Record<NoteCategory, { label: string; accent: string; chipBg: string; chipText: string; icon: string }> = {
  ROUTINE: { label: "Routine", accent: "bg-growth-green", chipBg: "bg-primary/10", chipText: "text-primary", icon: "bedtime" },
  MILESTONE: { label: "Milestones", accent: "bg-journal-peach", chipBg: "bg-secondary/10", chipText: "text-secondary", icon: "cake" },
  HEALTH: { label: "Health", accent: "bg-tertiary-fixed-dim", chipBg: "bg-tertiary/10", chipText: "text-tertiary", icon: "medical_services" },
  GENERAL: { label: "General", accent: "bg-outline-variant", chipBg: "bg-surface-container", chipText: "text-on-surface-variant", icon: "sticky_note_2" },
};
const CATEGORY_OPTIONS: NoteCategory[] = ["ROUTINE", "MILESTONE", "HEALTH", "GENERAL"];

export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "notes" ? "notes" : "conversations";

  useHeaderConfig({ title: "Messages" }, []);

  function setTab(next: "conversations" | "notes") {
    setSearchParams(next === "notes" ? { tab: "notes" } : {}, { replace: true });
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="px-container-padding py-2 sticky top-0 z-10 bg-surface">
        <div className="flex p-1 bg-surface-container-high rounded-full w-full">
          <button
            onClick={() => setTab("conversations")}
            className={`flex-1 py-2 text-center rounded-full font-label-md text-label-md transition-colors ${
              tab === "conversations" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
            }`}
          >
            Conversations
          </button>
          <button
            onClick={() => setTab("notes")}
            className={`flex-1 py-2 text-center rounded-full font-label-md text-label-md transition-colors ${
              tab === "notes" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
            }`}
          >
            Personal Notes
          </button>
        </div>
      </div>

      {tab === "conversations" ? <ConversationsTab /> : <PersonalNotesTab />}
    </div>
  );
}

function ConversationsTab() {
  const [threads, setThreads] = useState<ThreadSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <section className="px-container-padding pt-4 flex flex-col gap-section-margin pb-24">
      <div className="flex justify-end">
        <Link
          to="/messages/new"
          aria-label="New message"
          className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center"
        >
          <Icon name="add" />
        </Link>
      </div>
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
            <Avatar
              name={threadTitle(thread)}
              avatarAssetId={thread.members[0]?.avatarUrl}
              kind="adult"
              size="md"
            />
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

function PersonalNotesTab() {
  const [notes, setNotes] = useState<PersonalNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<NoteCategory>("GENERAL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState<NoteCategory>("GENERAL");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await apiGet<{ items: PersonalNoteDto[] }>("/notes");
      setNotes(res.items);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load your notes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const created = await apiPost<PersonalNoteDto>("/notes", {
        text: draft.trim(),
        category: draftCategory,
      } satisfies CreatePersonalNoteRequest);
      setNotes((prev) => [created, ...prev]);
      setDraft("");
      setDraftCategory("GENERAL");
      setShowCompose(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that note");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(note: PersonalNoteDto) {
    setEditingId(note.id);
    setEditText(note.text);
    setEditCategory(note.category ?? "GENERAL");
  }

  async function handleSaveEdit(noteId: string) {
    if (!editText.trim()) return;
    setBusy(true);
    try {
      const updated = await apiFetch<PersonalNoteDto>(`/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ text: editText.trim(), category: editCategory } satisfies UpdatePersonalNoteRequest),
      });
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that note");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(noteId: string) {
    setBusy(true);
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't delete that note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-container-padding py-element-gap relative">
      <div className="mb-element-gap">
        <h2 className="font-headline-md text-on-surface">Private Reminders</h2>
        <p className="font-body-md text-on-surface-variant mt-1">Keep track of small details and thoughts.</p>
      </div>

      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
      {!loading && notes.length === 0 && (
        <p className="font-body-md text-body-md text-on-surface-variant">No notes yet — tap the pencil to add one.</p>
      )}

      <div className="flex flex-col gap-element-gap pb-24">
        {notes.map((note) => {
          const meta = CATEGORY_META[note.category ?? "GENERAL"];
          const isEditing = editingId === note.id;
          return (
            <div
              key={note.id}
              className="bg-surface-container-lowest rounded-xl p-element-gap shadow-sm relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${meta.accent} rounded-l-xl`} />
              {isEditing ? (
                <div className="pl-2 flex flex-col gap-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full bg-surface rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    autoFocus
                  />
                  <CategoryPicker value={editCategory} onChange={setEditCategory} />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="font-label-sm text-label-sm text-on-surface-variant py-2 px-4"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(note.id)}
                      disabled={busy || !editText.trim()}
                      className="font-label-sm text-label-sm bg-primary text-on-primary py-2 px-4 rounded-full disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pl-2">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap flex-1">{note.text}</p>
                    <span className="font-label-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded-full shrink-0 ml-2">
                      {new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span
                      className={`inline-flex items-center gap-1 font-label-sm px-2 py-1 rounded-full ${meta.chipBg} ${meta.chipText}`}
                    >
                      <Icon name={meta.icon} className="text-[14px]" /> {meta.label}
                    </span>
                    <div className="flex gap-3">
                      <button onClick={() => startEdit(note)} className="text-on-surface-variant">
                        <Icon name="edit" className="text-[18px]" />
                      </button>
                      <button onClick={() => handleDelete(note.id)} className="text-on-surface-variant">
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        aria-label="Create new note"
        onClick={() => setShowCompose(true)}
        className="fixed bottom-24 right-container-padding w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:bg-surface-tint transition-colors z-40"
      >
        <Icon name="edit" className="text-[24px]" />
      </button>

      {showCompose && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <form
            onSubmit={handleAdd}
            className="w-full max-w-md bg-surface rounded-t-2xl p-container-padding flex flex-col gap-4 pb-safe"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface">New note</h3>
              <button type="button" onClick={() => setShowCompose(false)}>
                <Icon name="close" />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Jot something down — only you can see this."
              rows={4}
              autoFocus
              className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
            />
            <CategoryPicker value={draftCategory} onChange={setDraftCategory} />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save note"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ value, onChange }: { value: NoteCategory; onChange: (c: NoteCategory) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CATEGORY_OPTIONS.map((cat) => {
        const meta = CATEGORY_META[cat];
        const active = value === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={`inline-flex items-center gap-1 font-label-sm px-3 py-1.5 rounded-full transition-colors ${
              active ? "bg-primary text-on-primary" : `${meta.chipBg} ${meta.chipText}`
            }`}
          >
            <Icon name={meta.icon} className="text-[14px]" /> {meta.label}
          </button>
        );
      })}
    </div>
  );
}

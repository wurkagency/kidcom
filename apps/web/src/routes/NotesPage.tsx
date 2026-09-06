import { useEffect, useState, type FormEvent } from "react";
import type { CreatePersonalNoteRequest, PersonalNoteDto, UpdatePersonalNoteRequest } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiFetch, apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

// Private, per-user scratchpad — no Stitch mockup exists (see chunk 6 plan
// notes). Nothing here is shared with anyone.
export function NotesPage() {
  useHeaderConfig({ title: "My Notes", backTo: "/profile" }, []);

  const [notes, setNotes] = useState<PersonalNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
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
      } satisfies CreatePersonalNoteRequest);
      setNotes((prev) => [created, ...prev]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that note");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(note: PersonalNoteDto) {
    setEditingId(note.id);
    setEditText(note.text);
  }

  async function handleSaveEdit(noteId: string) {
    if (!editText.trim()) return;
    setBusy(true);
    try {
      const updated = await apiFetch<PersonalNoteDto>(`/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ text: editText.trim() } satisfies UpdatePersonalNoteRequest),
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
    <section className="px-container-padding pt-6 flex flex-col gap-section-margin pb-8">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Jot something down — only you can see this."
          rows={3}
          className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="self-end bg-primary text-on-primary font-label-md text-label-md py-2 px-5 rounded-full disabled:opacity-60"
        >
          Add note
        </button>
      </form>

      {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
      {!loading && notes.length === 0 && (
        <p className="font-body-md text-body-md text-on-surface-variant">No notes yet.</p>
      )}

      <div className="flex flex-col gap-2">
        {notes.map((note) => (
          <div key={note.id} className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-2">
            {editingId === note.id ? (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full bg-surface rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                  autoFocus
                />
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
              </>
            ) : (
              <>
                <p className="font-body-md text-body-md text-text-main whitespace-pre-wrap">{note.text}</p>
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

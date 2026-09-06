import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChildFamilyMember } from "@kidcom/shared";

import { apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

type Contact = { userId: string; firstName: string; lastName: string };

// Fans out GET /children/:id/family for every child the current user has and
// dedupes the results by userId — there's no single "all my contacts"
// endpoint (and none is needed for the handful of co-parents/family members a
// typical account has). Moved here from MessagesPage's old inline picker.
export function MessageComposePage() {
  const navigate = useNavigate();
  const { children } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  useHeaderConfig({ title: "New Message", backTo: "/messages" }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadContacts() {
      if (children.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const results = await Promise.all(
          children.map((c) => apiGet<{ members: ChildFamilyMember[] }>(`/children/${c.id}/family`))
        );
        if (cancelled) return;
        const byId = new Map<string, Contact>();
        for (const res of results) {
          for (const m of res.members) {
            byId.set(m.userId, { userId: m.userId, firstName: m.firstName, lastName: m.lastName });
          }
        }
        setContacts([...byId.values()]);
      } catch {
        if (!cancelled) setError("Couldn't load your contacts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContacts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  async function handleStart() {
    if (selected.size === 0 || starting) return;
    setStarting(true);
    try {
      const res = await apiPost<{ id: string }>("/messages/threads", {
        memberUserIds: [...selected],
      });
      navigate(`/messages/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't start that conversation");
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col px-container-padding pt-4">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-4">
        {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
        {!loading && contacts.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">
            No one to message yet — invite a co-parent or family member from a child's profile first.
          </p>
        )}
        {!loading &&
          contacts.map((c) => {
            const isSelected = selected.has(c.userId);
            return (
              <button
                key={c.userId}
                type="button"
                onClick={() => toggle(c.userId)}
                className={`bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center gap-3 text-left ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-headline-md shrink-0">
                  {c.firstName.charAt(0).toUpperCase()}
                </div>
                <span className="font-label-md text-label-md text-on-surface flex-1">
                  {c.firstName} {c.lastName}
                </span>
                <div
                  className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center ${
                    isSelected ? "bg-primary border-primary" : "border-outline"
                  }`}
                >
                  {isSelected && <div className="w-2.5 h-2.5 rounded-sm bg-on-primary" />}
                </div>
              </button>
            );
          })}
      </div>

      <div className="sticky bottom-20 z-40 bg-surface p-container-padding -mx-container-padding pb-safe border-t border-surface-variant/50">
        <button
          type="button"
          onClick={handleStart}
          disabled={selected.size === 0 || starting}
          className="w-full rounded-full bg-primary text-on-primary font-label-md text-label-md py-3.5 disabled:opacity-60"
        >
          {starting ? "Starting…" : "Start conversation"}
        </button>
      </div>
    </div>
  );
}

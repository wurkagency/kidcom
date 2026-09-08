import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type {
  ChildDetail,
  CreateEmergencyContactRequest,
  EmergencyContactCategory,
  EmergencyContactDto,
  MedicalInfoEntry,
  UpdateEmergencyContactRequest,
} from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiDelete, apiGet, apiPatch, apiPost, ApiRequestError } from "../lib/api";

// Matches docs/stitch_splitkid/emergency_contacts/code.html.
export function ChildContactsPage() {
  const { childId } = useParams<{ childId: string }>();
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [contacts, setContacts] = useState<EmergencyContactDto[]>([]);
  const [medicalInfo, setMedicalInfo] = useState<MedicalInfoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addingCategory, setAddingCategory] = useState<EmergencyContactCategory | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    async function load() {
      try {
        const [childRes, contactsRes, infoRes] = await Promise.all([
          apiGet<ChildDetail>(`/children/${childId}`),
          apiGet<{ items: EmergencyContactDto[] }>(`/children/${childId}/emergency-contacts`),
          apiGet<{ items: MedicalInfoEntry[] }>(`/children/${childId}/medical-info`),
        ]);
        if (cancelled) return;
        setChild(childRes);
        setContacts(contactsRes.items);
        setMedicalInfo(infoRes.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Couldn't load contacts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  async function refreshContacts() {
    if (!childId) return;
    const refreshed = await apiGet<{ items: EmergencyContactDto[] }>(`/children/${childId}/emergency-contacts`);
    setContacts(refreshed.items);
  }

  async function handleDelete(contact: EmergencyContactDto) {
    if (!childId || contact.derived) return;
    if (!window.confirm(`Remove "${contact.name}"?`)) return;
    setBusyId(contact.id);
    try {
      await apiDelete(`/children/${childId}/emergency-contacts/${contact.id}`);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that contact");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (error || !child) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error">{error ?? "Child not found"}</p>
      </section>
    );
  }

  const family = contacts.filter((c) => c.category === "FAMILY");
  const medical = contacts.filter((c) => c.category === "MEDICAL");
  const other = contacts.filter((c) => c.category === "OTHER");
  const criticalAllergy = medicalInfo.find((i) => i.category === "ALLERGY");

  return (
    <div className="flex flex-col w-full px-container-padding gap-section-margin pt-4">
      <section>
        <a
          href="tel:911"
          className="w-full bg-alert-soft-red text-on-error-container rounded-2xl p-6 flex flex-col items-center justify-center gap-3 shadow-sm transition-transform active:scale-[0.98]"
        >
          <Icon name="local_hospital" className="text-[48px]" />
          <div className="text-center">
            <h2 className="font-headline-md text-headline-md">Call 911</h2>
            <p className="font-label-md text-label-md opacity-90 mt-1">Emergency Services</p>
          </div>
        </a>
      </section>

      <section className="flex flex-col gap-element-gap">
        <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Family Contacts
        </h3>
        <div className="flex flex-col gap-base">
          {family.length === 0 && (
            <p className="font-body-md text-body-md text-on-surface-variant">No family contacts yet.</p>
          )}
          {family.map((c) => (
            <div key={c.id} className="bg-surface-container rounded-2xl p-4 flex items-center gap-4">
              <Avatar name={c.name} avatarAssetId={c.avatarUrl} kind="adult" size="lg" />
              <div className="flex-1 min-w-0">
                <h4 className="font-label-md text-label-md text-on-surface truncate">{c.name}</h4>
                <p className="font-body-md text-body-md text-on-surface-variant truncate">
                  {c.phone ?? "No phone on file"}
                </p>
              </div>
              {c.phone && (
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`sms:${c.phone}`}
                    aria-label={`Text ${c.name}`}
                    className="w-10 h-10 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center"
                  >
                    <Icon name="sms" className="text-[20px]" />
                  </a>
                  <a
                    href={`tel:${c.phone}`}
                    aria-label={`Call ${c.name}`}
                    className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center"
                  >
                    <Icon name="call" className="text-[20px]" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-element-gap">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Medical Providers
          </h3>
          <button
            onClick={() => {
              setAddingCategory("MEDICAL");
              setEditingId(null);
            }}
            className="font-label-sm text-label-sm text-primary flex items-center gap-1"
          >
            <Icon name="add" className="text-[16px]" /> Add
          </button>
        </div>
        <div className="grid grid-cols-1 gap-base">
          {medical.length === 0 && !addingCategory && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No medical providers added yet.
            </p>
          )}
          {medical.map((c) =>
            editingId === c.id ? (
              <ContactForm
                key={c.id}
                childId={childId!}
                category="MEDICAL"
                initial={c}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refreshContacts();
                }}
              />
            ) : (
              <div
                key={c.id}
                className="bg-surface-container rounded-2xl p-4 flex flex-col gap-3 shadow-sm relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                      <Icon name="stethoscope" className="text-[28px]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-label-md text-label-md text-on-surface truncate">{c.name}</h4>
                      <p className="font-label-sm text-label-sm text-primary truncate">{c.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center"
                      >
                        <Icon name="call" className="text-[20px]" />
                      </a>
                    )}
                    {!c.derived && (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(c.id);
                            setAddingCategory(null);
                          }}
                          className="w-9 h-9 flex items-center justify-center text-on-surface-variant"
                        >
                          <Icon name="edit" className="text-[18px]" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={busyId === c.id}
                          className="w-9 h-9 flex items-center justify-center text-on-surface-variant disabled:opacity-60"
                        >
                          <Icon name="delete" className="text-[18px]" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {c.location && (
                  <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md bg-surface p-2 rounded-lg">
                    <Icon name="location_on" className="text-[18px]" />
                    <span className="truncate">{c.location}</span>
                  </div>
                )}
              </div>
            )
          )}
          {addingCategory === "MEDICAL" && (
            <ContactForm
              childId={childId!}
              category="MEDICAL"
              onCancel={() => setAddingCategory(null)}
              onSaved={async () => {
                setAddingCategory(null);
                await refreshContacts();
              }}
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-element-gap">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Other Contacts
          </h3>
          <button
            onClick={() => {
              setAddingCategory("OTHER");
              setEditingId(null);
            }}
            className="font-label-sm text-label-sm text-primary flex items-center gap-1"
          >
            <Icon name="add" className="text-[16px]" /> Add
          </button>
        </div>
        <div className="bg-surface-container rounded-2xl overflow-hidden divide-y divide-surface-variant/20">
          {other.length === 0 && !addingCategory && (
            <p className="font-body-md text-body-md text-on-surface-variant p-4">
              No other contacts added yet.
            </p>
          )}
          {other.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="p-4 bg-surface-container">
                <ContactForm
                  childId={childId!}
                  category="OTHER"
                  initial={c}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await refreshContacts();
                  }}
                />
              </div>
            ) : (
              <div key={c.id} className="p-4 flex items-center justify-between bg-surface-container gap-2">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                    <Icon name="school" className="text-[20px]" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-label-md text-label-md text-on-surface truncate">{c.name}</h4>
                    <p className="font-body-md text-body-md text-on-surface-variant truncate">{c.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="p-2 text-primary">
                      <Icon name="call" />
                    </a>
                  )}
                  {!c.derived && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          setAddingCategory(null);
                        }}
                        className="w-9 h-9 flex items-center justify-center text-on-surface-variant"
                      >
                        <Icon name="edit" className="text-[18px]" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={busyId === c.id}
                        className="w-9 h-9 flex items-center justify-center text-on-surface-variant disabled:opacity-60"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          )}
          {addingCategory === "OTHER" && (
            <div className="p-4 bg-surface-container">
              <ContactForm
                childId={childId!}
                category="OTHER"
                onCancel={() => setAddingCategory(null)}
                onSaved={async () => {
                  setAddingCategory(null);
                  await refreshContacts();
                }}
              />
            </div>
          )}
        </div>
      </section>

      <section className="mb-4">
        <div className="bg-journal-peach/30 rounded-2xl p-5 relative overflow-hidden flex flex-col gap-3 shadow-sm">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-secondary-container rounded-full opacity-50 blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 text-on-secondary-fixed-variant z-10">
            <Icon name="info" className="text-[20px]" />
            <h4 className="font-label-md text-label-md">Critical Information</h4>
          </div>
          {criticalAllergy ? (
            <div className="bg-surface/80 backdrop-blur-sm rounded-xl p-3 inline-block self-start shadow-sm z-10">
              <span className="font-label-md text-label-md text-error flex items-center gap-2">
                <span className="relative w-2 h-2 flex">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                  <span className="relative w-2 h-2 rounded-full bg-error" />
                </span>
                {criticalAllergy.condition}
              </span>
            </div>
          ) : (
            <p className="font-body-md text-body-md text-on-secondary-fixed-variant/80">
              No allergies logged.
            </p>
          )}
          <p className="font-body-md text-body-md text-on-secondary-fixed-variant/80 mt-1">
            DOB: {new Date(child.birthday).toLocaleDateString()}
          </p>
        </div>
      </section>
    </div>
  );
}

// Small toggle-to-edit inline form for MEDICAL/OTHER contacts — FAMILY
// contacts are derived from ChildAccess and never go through here (the
// backend rejects category "FAMILY" on create, and derived rows carry no
// editable id).
function ContactForm({
  childId,
  category,
  initial,
  onCancel,
  onSaved,
}: {
  childId: string;
  category: Exclude<EmergencyContactCategory, "FAMILY">;
  initial?: EmergencyContactDto;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !phone.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await apiPatch(`/children/${childId}/emergency-contacts/${initial.id}`, {
          category,
          name: name.trim(),
          role: role.trim(),
          phone: phone.trim(),
          location: location.trim() || undefined,
        } satisfies UpdateEmergencyContactRequest);
      } else {
        await apiPost(`/children/${childId}/emergency-contacts`, {
          category,
          name: name.trim(),
          role: role.trim(),
          phone: phone.trim(),
          location: location.trim() || undefined,
        } satisfies CreateEmergencyContactRequest);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
        required
        autoFocus
      />
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder={category === "MEDICAL" ? "Role, e.g. Pediatrician" : "Role, e.g. Teacher"}
        className="w-full bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
        required
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone"
        type="tel"
        className="w-full bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
        required
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location (optional)"
        className="w-full bg-surface-container rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
      />
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !role.trim() || !phone.trim()}
          className="flex-1 py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

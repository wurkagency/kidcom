import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type {
  ChildDetail,
  CreateGrowthEntryRequest,
  GrowthEntryDto,
  UpdateGrowthEntryRequest,
} from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { GrowthChart } from "../components/GrowthChart";
import { Icon } from "../components/Icon";
import { apiDelete, apiGet, apiPatch, apiPost, ApiRequestError } from "../lib/api";
import { formatHeight, formatWeight, getUnitSystem } from "../lib/preferences";
import { shouldUseBmiForWeight } from "../lib/whoGrowthStandards";

function ageLabel(birthday: string) {
  const now = new Date();
  const dob = new Date(birthday);
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} years, ${months} months`;
}

// Matches docs/stitch_splitkid/growth_charts/code.html, minus the WHO
// percentile shading (needs real WHO LMS reference data — see chunk 3 plan).
// Reached from a specific child's profile (/children/:childId/growth) —
// Growth is no longer a top-level tab, so there's no in-page child switcher
// here anymore; picking a different child means going back to their profile.
export function GrowthPage() {
  const { childId } = useParams<{ childId: string }>();
  const units = useMemo(() => getUnitSystem(), []);
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [entries, setEntries] = useState<GrowthEntryDto[]>([]);
  const [metric, setMetric] = useState<"height" | "weight">("height");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 10));
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const [childRes, entriesRes] = await Promise.all([
          apiGet<ChildDetail>(`/children/${childId}`),
          apiGet<{ items: GrowthEntryDto[] }>(`/children/${childId}/growth-entries`),
        ]);
        if (cancelled) return;
        setChild(childRes);
        setEntries(entriesRes.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Couldn't load growth data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    setLoading(true);
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!childId) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<GrowthEntryDto>(`/children/${childId}/growth-entries`, {
        measuredAt,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
      } satisfies CreateGrowthEntryRequest);
      const refreshed = await apiGet<{ items: GrowthEntryDto[] }>(
        `/children/${childId}/growth-entries`
      );
      setEntries(refreshed.items);
      setShowForm(false);
      setHeightCm("");
      setWeightKg("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't log that measurement");
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshEntries() {
    if (!childId) return;
    const refreshed = await apiGet<{ items: GrowthEntryDto[] }>(`/children/${childId}/growth-entries`);
    setEntries(refreshed.items);
  }

  async function handleDeleteEntry(entry: GrowthEntryDto) {
    if (!childId) return;
    if (!window.confirm("Delete this measurement?")) return;
    setBusyId(entry.id);
    try {
      await apiDelete(`/children/${childId}/growth-entries/${entry.id}`);
      await refreshEntries();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't delete that measurement");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !child) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  const latest = [...entries].reverse().find((e) => e.heightCm != null);
  const latestWeight = [...entries].reverse().find((e) => e.weightKg != null);
  const recentLogs = [...entries].reverse().slice(0, 5);
  const isBmiMode = metric === "weight" && shouldUseBmiForWeight(child.birthday, child.gender);

  return (
    <div className="flex flex-col w-full px-container-padding gap-section-margin pt-4 relative">
      <section className="flex flex-col gap-element-gap">
        <div className="flex items-center gap-element-gap">
          <Avatar
            name={child.firstName}
            avatarAssetId={child.profileImageUrl}
            kind="child"
            size="lg"
            className="shadow-sm"
          />
          <div className="flex flex-col">
            <h1 className="font-headline-lg-mobile text-on-surface">{child.firstName}'s Growth</h1>
            <p className="font-body-md text-on-surface-variant">{ageLabel(child.birthday)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-grid-gutter">
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
            <Icon name="height" className="text-primary mb-1" />
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">Height</span>
            <span className="font-headline-md text-on-surface mt-1">
              {latest?.heightCm != null ? formatHeight(latest.heightCm, units) : "—"}
            </span>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
            <Icon name="scale" className="text-primary mb-1" />
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">Weight</span>
            <span className="font-headline-md text-on-surface mt-1">
              {latestWeight?.weightKg != null ? formatWeight(latestWeight.weightKg, units) : "—"}
            </span>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
        <div className="p-container-padding flex justify-between items-center border-b border-surface-variant/50">
          <div>
            <h2 className="font-headline-md text-on-surface">
              {metric === "height" ? "Height Chart" : isBmiMode ? "BMI-for-age" : "Weight Chart"}
            </h2>
            <p className="font-label-sm text-on-surface-variant mt-1">WHO Percentiles</p>
          </div>
          <div className="flex bg-surface-container rounded-full p-1">
            <button
              onClick={() => setMetric("height")}
              className={`px-3 py-1 rounded-full font-label-sm transition-all ${
                metric === "height" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
              }`}
            >
              cm
            </button>
            <button
              onClick={() => setMetric("weight")}
              className={`px-3 py-1 rounded-full font-label-sm transition-all ${
                metric === "weight" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
              }`}
            >
              kg
            </button>
          </div>
        </div>
        <GrowthChart entries={entries} metric={metric} child={{ birthday: child.birthday, gender: child.gender }} />
      </section>

      <section className="flex flex-col gap-element-gap mb-8">
        <h3 className="font-headline-md text-on-surface">Recent Logs</h3>
        {recentLogs.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">
            No measurements logged yet.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {recentLogs.map((entry) =>
            editingId === entry.id ? (
              <GrowthEntryEditForm
                key={entry.id}
                childId={childId!}
                entry={entry}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refreshEntries();
                }}
              />
            ) : (
              <div
                key={entry.id}
                className="bg-surface-container-lowest rounded-xl p-4 flex justify-between items-center gap-3 shadow-sm border border-surface-variant/30"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                    <Icon name="calendar_today" className="text-[20px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-on-surface">
                      {new Date(entry.measuredAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    {entry.note && (
                      <p className="font-body-md text-sm text-on-surface-variant mt-0.5 truncate">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    {entry.heightCm != null && (
                      <p className="font-label-md text-on-surface">{formatHeight(entry.heightCm, units)}</p>
                    )}
                    {entry.weightKg != null && (
                      <p className="font-label-sm text-on-surface-variant mt-0.5">{formatWeight(entry.weightKg, units)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingId(entry.id)}
                    className="w-8 h-8 flex items-center justify-center text-on-surface-variant"
                  >
                    <Icon name="edit" className="text-[16px]" />
                  </button>
                  <button
                    onClick={() => handleDeleteEntry(entry)}
                    disabled={busyId === entry.id}
                    className="w-8 h-8 flex items-center justify-center text-on-surface-variant disabled:opacity-60"
                  >
                    <Icon name="delete" className="text-[16px]" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </section>

      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-24 right-container-padding w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:bg-surface-tint active:scale-95 transition-transform z-40"
      >
        <Icon name="add" className="text-[28px]" />
      </button>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md bg-surface rounded-t-2xl p-container-padding flex flex-col gap-4 pb-safe"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface">Log a measurement</h3>
              <button type="button" onClick={() => setShowForm(false)}>
                <Icon name="close" />
              </button>
            </div>
            <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Date
              <input
                type="date"
                value={measuredAt}
                onChange={(e) => setMeasuredAt(e.target.value)}
                className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </label>
            <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Height (cm)
              <input
                type="number"
                step="0.1"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Weight (kg)
              <input
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            {error && (
              <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Inline toggle-to-edit form for one Recent Logs row, matching
// CalendarPage's add-appointment inline-form pattern.
function GrowthEntryEditForm({
  childId,
  entry,
  onCancel,
  onSaved,
}: {
  childId: string;
  entry: GrowthEntryDto;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [measuredAt, setMeasuredAt] = useState(entry.measuredAt.slice(0, 10));
  const [heightCm, setHeightCm] = useState(entry.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(entry.weightKg?.toString() ?? "");
  const [note, setNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/children/${childId}/growth-entries/${entry.id}`, {
        measuredAt: new Date(measuredAt).toISOString(),
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        note: note.trim() || undefined,
      } satisfies UpdateGrowthEntryRequest);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that measurement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container rounded-xl p-4 flex flex-col gap-3 shadow-sm"
    >
      <div className="flex gap-3">
        <label className="flex-1 flex flex-col gap-1 font-label-sm text-label-sm text-on-surface">
          Date
          <input
            type="date"
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
            className="bg-surface-container-lowest rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </label>
      </div>
      <div className="flex gap-3">
        <label className="flex-1 flex flex-col gap-1 font-label-sm text-label-sm text-on-surface">
          Height (cm)
          <input
            type="number"
            step="0.1"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="bg-surface-container-lowest rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="flex-1 flex flex-col gap-1 font-label-sm text-label-sm text-on-surface">
          Weight (kg)
          <input
            type="number"
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="bg-surface-container-lowest rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface">
        Note
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="bg-surface-container-lowest rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 rounded-full bg-primary text-on-primary font-label-sm text-label-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

import { useState } from "react";
import { CUSTODY_PRESETS } from "@kidcom/shared";
import type { ChildFamilyMember, CustodyPattern, CustodyPlanDto, SetCustodyPlanRequest } from "@kidcom/shared";

import { Icon } from "./Icon";
import { apiFetch, ApiRequestError } from "../lib/api";

type PresetKey = keyof typeof CUSTODY_PRESETS;

type CustomBlock = { parentIndex: 0 | 1; days: number };

const PRESET_ICONS: Record<PresetKey, string> = {
  WEEK_ON_WEEK_OFF: "calendar_view_week",
  TWO_TWO_THREE: "calendar_view_day",
  THREE_FOUR_FOUR_THREE: "calendar_view_day",
  FIVE_TWO: "weekend",
};

const PRESET_DESCRIPTIONS: Record<PresetKey, string> = {
  WEEK_ON_WEEK_OFF: "7 days with each parent",
  TWO_TWO_THREE: "Alternating weekends, 2-day splits midweek",
  THREE_FOUR_FOUR_THREE: "Alternating weekends, longer midweek blocks",
  FIVE_TWO: "One parent has weekdays, the other always has the weekend",
};

// Builds the patternDays a given preset would produce for these two
// parents, in the same order handlePick uses — used both to save a preset
// and (in reverse) to detect whether an existing plan already matches one.
function patternForPreset(preset: PresetKey, userIds: [string, string]): CustodyPattern {
  const def = CUSTODY_PRESETS[preset];
  return {
    cycleLengthDays: def.cycleLengthDays,
    blocks: def.blockDayCounts.map((days, i) => ({
      userId: userIds[i % userIds.length],
      days,
    })),
  };
}

function patternsMatch(a: CustodyPattern, b: CustodyPattern): boolean {
  if (a.cycleLengthDays !== b.cycleLengthDays || a.blocks.length !== b.blocks.length) return false;
  return a.blocks.every((block, i) => block.userId === b.blocks[i].userId && block.days === b.blocks[i].days);
}

function blocksFromPattern(pattern: CustodyPattern, userIds: [string, string]): CustomBlock[] {
  return pattern.blocks.map((b) => ({
    parentIndex: (userIds[1] === b.userId ? 1 : 0) as 0 | 1,
    days: b.days,
  }));
}

// "YYYY-MM-DD" in the viewer's local timezone — what a date <input> wants,
// and what resolveCustodyForDate treats as a UTC-midnight day boundary
// (same convention CalendarPage/HomePage use for "today").
function toLocalDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Shown on the Calendar tab both to set up a first custody schedule and to
// edit an existing one (existingPlan). Offers the built-in presets from
// packages/shared/src/custody.ts plus a custom pattern builder — any
// repeating sequence of "this parent, this many days" blocks, since
// resolveCustodyForDate already supports arbitrary blocks/cycle lengths.
export function CustodySetup({
  childId,
  parents,
  existingPlan,
  onSaved,
  onCancel,
}: {
  childId: string;
  parents: ChildFamilyMember[];
  existingPlan?: CustodyPlanDto | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const parentA = parents[0];
  const parentB = parents[1];
  // A co-parent is optional — a solo parent can still create and maintain
  // their own schedule (see the banner below); collaboration (both parents
  // sharing/editing the same plan) is what actually requires parentB.
  const hasCoParent = Boolean(parentA && parentB);
  const userIds: [string, string] | null = parentA && parentB ? [parentA.userId, parentB.userId] : null;
  // Solo mode only ever assigns blocks to parentA — patternForPreset/
  // blocksFromPattern below all key off `userIds`, which stays [string,
  // string] | null (presets genuinely need two people to alternate between),
  // but the custom-block editor works off this single id instead so it
  // still functions with just one parent.
  const soloUserId = parentA?.userId;

  // If the existing plan matches a known preset exactly, default to the
  // presets tab (nothing to pre-fill); otherwise it's a hand-built pattern,
  // so open straight into the custom tab pre-filled with its actual blocks.
  const matchedPreset =
    existingPlan && userIds
      ? (Object.keys(CUSTODY_PRESETS) as PresetKey[]).find((key) =>
          patternsMatch(patternForPreset(key, userIds), existingPlan.patternDays)
        )
      : undefined;

  const [mode, setMode] = useState<"presets" | "custom">(
    !hasCoParent || (existingPlan && !matchedPreset) ? "custom" : "presets"
  );
  const [saving, setSaving] = useState<PresetKey | "custom" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(
    existingPlan ? existingPlan.startDate.slice(0, 10) : toLocalDateOnly(new Date())
  );
  const [customLabel, setCustomLabel] = useState(existingPlan?.label ?? "Custom schedule");
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>(() =>
    existingPlan && userIds ? blocksFromPattern(existingPlan.patternDays, userIds) : [{ parentIndex: 0, days: 7 }]
  );

  if (!parentA || !soloUserId) {
    return (
      <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-2">
        <p className="font-label-md text-label-md text-on-surface">Custody schedule</p>
        <p className="font-body-md text-body-md text-on-surface-variant">
          You'll need parent access to this child's profile to set up a custody schedule.
        </p>
      </div>
    );
  }

  async function savePattern(label: string, patternDays: CustodyPattern, key: PresetKey | "custom") {
    if (!startDate) {
      setError("Pick a start date for the schedule");
      return;
    }
    setError(null);
    setSaving(key);
    try {
      await apiFetch(`/children/${childId}/custody-plan`, {
        method: "PUT",
        body: JSON.stringify({
          label,
          startDate,
          patternDays,
        } satisfies SetCustodyPlanRequest),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that schedule");
    } finally {
      setSaving(null);
    }
  }

  function handlePickPreset(preset: PresetKey) {
    savePattern(CUSTODY_PRESETS[preset].label, patternForPreset(preset, userIds!), preset);
  }

  function handleSaveCustom() {
    const days = customBlocks.reduce((sum, b) => sum + b.days, 0);
    const blockUserIds = userIds ?? [soloUserId, soloUserId];
    savePattern(
      customLabel.trim() || "Custom schedule",
      {
        cycleLengthDays: days,
        blocks: customBlocks.map((b) => ({ userId: blockUserIds[b.parentIndex], days: b.days })),
      },
      "custom"
    );
  }

  function updateBlock(index: number, patch: Partial<CustomBlock>) {
    setCustomBlocks((blocks) => blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeBlock(index: number) {
    setCustomBlocks((blocks) => blocks.filter((_, i) => i !== index));
  }

  const customTotalDays = customBlocks.reduce((sum, b) => sum + b.days, 0);
  const customIsValid = customBlocks.length > 0 && customBlocks.every((b) => b.days >= 1);

  return (
    <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-label-md text-label-md text-on-surface mb-1">
            {existingPlan ? "Edit custody schedule" : "Set up your custody schedule"}
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {hasCoParent
              ? `Pick a pattern, or build a custom one — ${parentA.firstName} and ${parentB!.firstName}.`
              : `Build ${parentA.firstName}'s schedule for this child.`}
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="shrink-0 p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low"
            aria-label="Cancel editing"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {!hasCoParent && (
        <div className="bg-surface-container-lowest rounded-xl p-4 flex items-start gap-3">
          <Icon name="info" className="text-primary shrink-0" />
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            No co-parent yet — this schedule is private to you until you invite them. They'll be
            able to see and help maintain it once they join this child's profile.
          </p>
        </div>
      )}

      <div className="relative">
        <label
          className="absolute -top-2 left-4 px-1 bg-surface-container text-label-sm font-label-sm text-primary z-10"
          htmlFor="custody-start-date"
        >
          Start date
        </label>
        <input
          id="custody-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
        />
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 px-1">
          The pattern below starts counting from this date — {parentA.firstName} has the child
          first.
        </p>
      </div>

      {hasCoParent && (
        <div className="flex gap-2 bg-surface-container-lowest rounded-full p-1">
          <button
            onClick={() => setMode("presets")}
            className={`flex-1 py-2 rounded-full font-label-sm text-label-sm transition-colors ${
              mode === "presets" ? "bg-primary text-on-primary" : "text-on-surface-variant"
            }`}
          >
            Presets
          </button>
          <button
            onClick={() => setMode("custom")}
            className={`flex-1 py-2 rounded-full font-label-sm text-label-sm transition-colors ${
              mode === "custom" ? "bg-primary text-on-primary" : "text-on-surface-variant"
            }`}
          >
            Custom
          </button>
        </div>
      )}

      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {mode === "presets" ? (
        <div className="flex flex-col gap-3">
          {(Object.keys(CUSTODY_PRESETS) as PresetKey[]).map((key) => (
            <button
              key={key}
              onClick={() => handlePickPreset(key)}
              disabled={saving !== null || !startDate}
              className="w-full bg-surface-container-lowest rounded-xl p-4 flex items-center gap-3 text-left shadow-sm disabled:opacity-60"
            >
              <Icon name={PRESET_ICONS[key]} className="text-primary" />
              <div className="flex-1">
                <p className="font-label-md text-label-md text-on-surface">
                  {CUSTODY_PRESETS[key].label}
                </p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {PRESET_DESCRIPTIONS[key]}
                </p>
              </div>
              {saving === key && (
                <span className="font-label-sm text-label-sm text-on-surface-variant">Saving…</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <label
              className="absolute -top-2 left-4 px-1 bg-surface-container text-label-sm font-label-sm text-primary z-10"
              htmlFor="custom-schedule-label"
            >
              Schedule name
            </label>
            <input
              id="custom-schedule-label"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
            />
          </div>

          <div className="flex flex-col gap-2">
            {customBlocks.map((block, i) => (
              <div key={i} className="flex items-center gap-2">
                {hasCoParent ? (
                  <select
                    value={block.parentIndex}
                    onChange={(e) => updateBlock(i, { parentIndex: Number(e.target.value) as 0 | 1 })}
                    className="flex-1 bg-surface-container-lowest rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-primary font-body-sm text-body-sm"
                  >
                    <option value={0}>{parentA.firstName}</option>
                    <option value={1}>{parentB!.firstName}</option>
                  </select>
                ) : (
                  <span className="flex-1 bg-surface-container-lowest rounded-xl px-3 py-3 font-body-sm text-body-sm text-on-surface-variant">
                    With {parentA.firstName}
                  </span>
                )}
                <input
                  type="number"
                  min={1}
                  value={block.days}
                  onChange={(e) => updateBlock(i, { days: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20 bg-surface-container-lowest rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-primary font-body-sm text-body-sm text-center"
                  aria-label="Days"
                />
                <span className="font-body-sm text-body-sm text-on-surface-variant w-10">
                  day{block.days === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => removeBlock(i)}
                  disabled={customBlocks.length <= 1}
                  className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
                  aria-label="Remove block"
                >
                  <Icon name="delete" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setCustomBlocks((blocks) => [...blocks, { parentIndex: 0, days: 1 }])}
              className="w-full py-3 rounded-xl bg-surface-container-lowest text-primary font-label-sm text-label-sm flex items-center justify-center gap-2"
            >
              <Icon name="add" />
              Add block
            </button>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Repeats every {customTotalDays} day{customTotalDays === 1 ? "" : "s"}.
          </p>

          <button
            onClick={handleSaveCustom}
            disabled={!customIsValid || saving !== null || !startDate}
            className="w-full py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
          >
            {saving === "custom" ? "Saving…" : "Save custom schedule"}
          </button>
        </div>
      )}
    </div>
  );
}

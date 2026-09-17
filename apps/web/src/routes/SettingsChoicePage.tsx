import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Icon } from "../components/Icon";
import { ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";
import {
  getCalendarDefaultView,
  getDateFormat,
  getJournalVisibility,
  getLanguage,
  getTimeZone,
  setCalendarDefaultView,
  setDateFormat,
  setJournalVisibility,
  setLanguage,
  setTimeZone,
  type CalendarDefaultView,
  type DateFormat,
  type JournalVisibility,
} from "../lib/preferences";

const LANGUAGE_OPTIONS = ["English (US)", "English (UK)", "Español", "Français", "Dansk"];
const DATE_FORMAT_OPTIONS: DateFormat[] = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
const TIME_ZONE_OPTIONS = [
  "Pacific Time (PT)",
  "Mountain Time (MT)",
  "Central Time (CT)",
  "Eastern Time (ET)",
  "Central European Time (CET)",
  "UTC",
];
const CALENDAR_VIEW_OPTIONS: { value: CalendarDefaultView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];
const JOURNAL_VISIBILITY_OPTIONS: { value: JournalVisibility; label: string }[] = [
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
];

type ChoiceConfig = {
  title: string;
  backTo: string;
  options: { label: string; value: string }[];
  getValue: () => string;
  setValue: (value: string) => void | Promise<void>;
};

// One full-screen "pick one of several values" page, reused for every
// multi-option setting on App Preferences and Privacy & Security — per
// Charlie's instruction, changing these is its own page rather than an
// inline bottom sheet/dropdown, matching a standard Settings-app pattern.
// Mounted at both /preferences/:field and /security/:field in App.tsx; the
// field names are unique across both so one CONFIGS map covers both.
const CONFIGS: Record<string, ChoiceConfig> = {
  language: {
    title: "App Language",
    backTo: "/preferences",
    options: LANGUAGE_OPTIONS.map((label) => ({ label, value: label })),
    getValue: getLanguage,
    setValue: setLanguage,
  },
  "date-format": {
    title: "Date Format",
    backTo: "/preferences",
    options: DATE_FORMAT_OPTIONS.map((label) => ({ label, value: label })),
    getValue: getDateFormat,
    setValue: (v) => setDateFormat(v as DateFormat),
  },
  "time-zone": {
    title: "Time Zone",
    backTo: "/preferences",
    options: TIME_ZONE_OPTIONS.map((label) => ({ label, value: label })),
    getValue: getTimeZone,
    setValue: setTimeZone,
  },
  "calendar-view": {
    title: "Default Calendar View",
    backTo: "/preferences",
    options: CALENDAR_VIEW_OPTIONS,
    getValue: getCalendarDefaultView,
    setValue: (v) => setCalendarDefaultView(v as CalendarDefaultView),
  },
  "journal-visibility": {
    title: "Journal Entry Visibility",
    backTo: "/security",
    options: JOURNAL_VISIBILITY_OPTIONS,
    getValue: getJournalVisibility,
    setValue: (v) => setJournalVisibility(v as JournalVisibility),
  },
};

export function SettingsChoicePage() {
  const { field } = useParams<{ field: string }>();
  const navigate = useNavigate();
  const config = field ? CONFIGS[field] : undefined;

  useHeaderConfig({ title: config?.title ?? "Settings", backTo: config?.backTo ?? "/profile" }, [config?.title]);

  const [selected, setSelected] = useState(() => config?.getValue() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!config) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error">Unknown setting.</p>
      </section>
    );
  }

  async function choose(value: string) {
    const previous = selected;
    setSelected(value);
    setError(null);
    setSaving(true);
    try {
      await config!.setValue(value);
      navigate(config!.backTo);
    } catch (err) {
      setSelected(previous);
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save that change");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-container-padding pt-4 flex flex-col gap-1 pb-8">
      {error && <p className="font-body-sm text-body-sm text-error px-4 pb-2">{error}</p>}
      {config.options.map((option) => (
        <button
          key={option.value}
          onClick={() => choose(option.value)}
          disabled={saving}
          className={`w-full flex items-center justify-between py-4 px-4 rounded-xl font-label-md text-label-md transition-colors disabled:opacity-60 ${
            option.value === selected ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-surface-container"
          }`}
        >
          {option.label}
          {option.value === selected && <Icon name="check" className="text-primary" />}
        </button>
      ))}
    </div>
  );
}

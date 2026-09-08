import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Icon } from "../components/Icon";
import { useHeaderConfig } from "../lib/HeaderContext";
import {
  getCalendarDefaultView,
  getDateFormat,
  getLanguage,
  getTextSize,
  getTheme,
  getTimeZone,
  getUnitSystem,
  getWeekStart,
  setTextSize,
  setTheme,
  setUnitSystem,
  setWeekStart,
  type TextSize,
  type Theme,
  type UnitSystem,
  type WeekStart,
} from "../lib/preferences";

// Matches docs/stitch_splitkid/app_preferences/code.html row-for-row. Every
// row is real, persisted, interactive state (see lib/preferences.ts) — Units
// and Start of Week are the only two read anywhere else in the app today
// (Growth, Calendar); the rest have their storage layer wired up now so
// there's something real to switch, with the screens that would *read* them
// (a dark palette, a scalable type system, i18n, a month calendar grid,
// per-timezone rendering) coming later. Language, Date Format, Time Zone,
// and Default View each open their own dedicated page (SettingsChoicePage)
// instead of an inline sheet, for a better view when picking a value.
export function AppPreferencesPage() {
  useHeaderConfig({ title: "App Preferences", backTo: "/profile" }, []);
  const navigate = useNavigate();

  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [textSize, setTextSizeState] = useState<TextSize>(() => getTextSize());
  const [language] = useState(() => getLanguage());
  const [dateFormat] = useState(() => getDateFormat());
  const [timeZone] = useState(() => getTimeZone());
  const [units, setUnits] = useState<UnitSystem>(() => getUnitSystem());
  const [calendarView] = useState(() => getCalendarDefaultView());
  const [weekStart, setWeekStartState] = useState<WeekStart>(() => getWeekStart());

  function handleThemeToggle() {
    const next = theme === "light" ? "dark" : "light";
    setThemeState(next);
    setTheme(next);
  }

  function handleUnitsChange(next: UnitSystem) {
    setUnits(next);
    setUnitSystem(next);
  }

  function handleWeekStartChange(next: WeekStart) {
    setWeekStartState(next);
    setWeekStart(next);
  }

  return (
    <div className="px-container-padding pt-4 space-y-element-gap pb-8">
      <div className="space-y-base mt-4">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Appearance
        </h2>
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-4 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center">
                <Icon name="palette" className="text-primary" />
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface">Theme</p>
                <p className="font-body-md text-[14px] text-on-surface-variant leading-tight">
                  Current: {theme === "light" ? "Light Mode" : "Dark Mode"}
                </p>
              </div>
            </div>
            <button
              onClick={handleThemeToggle}
              aria-label="Toggle Theme"
              className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${
                theme === "dark" ? "bg-primary" : "bg-surface-variant"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-on-tertiary shadow-sm absolute top-0.5 transition-transform duration-300 ${
                  theme === "dark" ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center">
                <Icon name="text_fields" className="text-secondary" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Text Size</p>
            </div>
            <div className="flex bg-surface-container-low rounded-xl p-1 gap-1">
              {(["small", "standard", "large"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setTextSizeState(size);
                    setTextSize(size);
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-label-md text-label-md transition-colors ${
                    textSize === size ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                  }`}
                >
                  {size === "small" ? "Small" : size === "standard" ? "Standard" : "Large"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-base">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Language &amp; Region
        </h2>
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-4 space-y-4">
          <PickerRow
            icon="language"
            iconClass="text-tertiary"
            label="App Language"
            value={language}
            onClick={() => navigate("/preferences/language")}
          />
          <PickerRow
            icon="today"
            iconClass="text-tertiary"
            label="Date Format"
            value={dateFormat}
            onClick={() => navigate("/preferences/date-format")}
          />
          <PickerRow
            icon="schedule"
            iconClass="text-tertiary"
            label="Time Zone"
            value={timeZone}
            onClick={() => navigate("/preferences/time-zone")}
          />
        </div>
      </div>

      <div className="space-y-base">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Units
        </h2>
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-growth-green/10 flex items-center justify-center">
                <Icon name="straighten" className="text-growth-green" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Height</p>
            </div>
            <div className="flex bg-surface-container-low rounded-lg p-1">
              <button
                onClick={() => handleUnitsChange("metric")}
                className={`py-1.5 px-3 rounded-md font-label-md text-label-md transition-colors ${
                  units === "metric" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                cm
              </button>
              <button
                onClick={() => handleUnitsChange("imperial")}
                className={`py-1.5 px-3 rounded-md font-label-md text-label-md transition-colors ${
                  units === "imperial" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                ft/in
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-growth-green/10 flex items-center justify-center">
                <Icon name="monitor_weight" className="text-growth-green" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Weight</p>
            </div>
            <div className="flex bg-surface-container-low rounded-lg p-1">
              <button
                onClick={() => handleUnitsChange("metric")}
                className={`py-1.5 px-3 rounded-md font-label-md text-label-md transition-colors ${
                  units === "metric" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                kg
              </button>
              <button
                onClick={() => handleUnitsChange("imperial")}
                className={`py-1.5 px-3 rounded-md font-label-md text-label-md transition-colors ${
                  units === "imperial" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                lbs
              </button>
            </div>
          </div>
          <p className="font-body-md text-[13px] text-on-surface-variant leading-tight">
            Applies to Growth's stat cards, chart, and logs. Measurements are always stored in cm/kg — this only
            changes how they're displayed. Height and weight share one unit system, so switching either switches
            both.
          </p>
        </div>
      </div>

      <div className="space-y-base">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Calendar
        </h2>
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-4 space-y-4">
          <PickerRow
            icon="calendar_view_week"
            iconClass="text-primary"
            label="Default View"
            value={calendarView === "month" ? "Month" : "Week"}
            onClick={() => navigate("/preferences/calendar-view")}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center">
                <Icon name="first_page" className="text-primary" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Start of Week</p>
            </div>
            <div className="flex bg-surface-container-low rounded-lg p-1">
              <button
                onClick={() => handleWeekStartChange("sunday")}
                className={`py-1.5 px-3 rounded-md font-label-md text-label-md transition-colors ${
                  weekStart === "sunday" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                Sun
              </button>
              <button
                onClick={() => handleWeekStartChange("monday")}
                className={`py-1.5 px-3 rounded-md font-label-md text-label-md transition-colors ${
                  weekStart === "monday" ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                Mon
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function PickerRow({
  icon,
  iconClass,
  label,
  value,
  onClick,
}: {
  icon: string;
  iconClass: string;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between py-2 group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-tertiary-container/20 flex items-center justify-center">
          <Icon name={icon} className={iconClass} />
        </div>
        <div className="text-left">
          <p className="font-label-md text-label-md text-on-surface group-hover:text-primary transition-colors">
            {label}
          </p>
          <p className="font-body-md text-[14px] text-on-surface-variant leading-tight">{value}</p>
        </div>
      </div>
      <Icon name="chevron_right" className="text-on-surface-variant group-hover:text-primary transition-colors" />
    </button>
  );
}


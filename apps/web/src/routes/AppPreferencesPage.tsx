import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { SegmentedControl } from "../components/SegmentedControl";
import { Toggle } from "../components/Toggle";
import { useHeaderConfig } from "../lib/HeaderContext";
import { useSkin } from "../lib/SkinContext";
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
import { SKINS } from "../lib/themes";

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
  const { skin } = useSkin();
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
        <Card className="space-y-6">
          <PickerRow
            icon="style"
            iconClass="text-primary"
            label="Skin"
            value={SKINS.find((s) => s.id === skin)?.name ?? skin}
            onClick={() => navigate("/preferences/skin")}
          />
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
            <Toggle
              checked={theme === "dark"}
              onToggle={handleThemeToggle}
              size="lg"
              onKnobColor="bg-on-tertiary"
              offKnobColor="bg-on-tertiary"
              aria-label="Toggle Theme"
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center">
                <Icon name="text_fields" className="text-secondary" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Text Size</p>
            </div>
            <SegmentedControl
              size="md"
              value={textSize}
              onChange={(size) => {
                setTextSizeState(size);
                setTextSize(size);
              }}
              options={[
                { value: "small", label: "Small" },
                { value: "standard", label: "Standard" },
                { value: "large", label: "Large" },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="space-y-base">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Language &amp; Region
        </h2>
        <Card className="space-y-4">
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
        </Card>
      </div>

      <div className="space-y-base">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Units
        </h2>
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-growth-green/10 flex items-center justify-center">
                <Icon name="straighten" className="text-growth-green" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Height</p>
            </div>
            <SegmentedControl
              value={units}
              onChange={handleUnitsChange}
              options={[
                { value: "metric", label: "cm" },
                { value: "imperial", label: "ft/in" },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-growth-green/10 flex items-center justify-center">
                <Icon name="monitor_weight" className="text-growth-green" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Weight</p>
            </div>
            <SegmentedControl
              value={units}
              onChange={handleUnitsChange}
              options={[
                { value: "metric", label: "kg" },
                { value: "imperial", label: "lbs" },
              ]}
            />
          </div>
          <p className="font-body-md text-[13px] text-on-surface-variant leading-tight">
            Applies to Growth's stat cards, chart, and logs. Measurements are always stored in cm/kg — this only
            changes how they're displayed. Height and weight share one unit system, so switching either switches
            both.
          </p>
        </Card>
      </div>

      <div className="space-y-base">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pl-4">
          Calendar
        </h2>
        <Card className="space-y-4">
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
            <SegmentedControl
              value={weekStart}
              onChange={handleWeekStartChange}
              options={[
                { value: "sunday", label: "Sun" },
                { value: "monday", label: "Mon" },
              ]}
            />
          </div>
        </Card>
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


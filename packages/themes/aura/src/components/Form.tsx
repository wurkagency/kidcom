import { useState, type ReactNode } from "react";
import type { CategoryDto, ChildSummary } from "@kinnd/shared";
import { useCategories, useFormat, useNavigate, useT } from "@kinnd/core";

import { CategoryChip } from "../calendar/CategoryChip";
import { useCategoryName } from "../calendar/people";
import { menuContentClass } from "../calendar/Sections";
import { cn } from "../lib/utils";
import { Calendar } from "../ui/calendar";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Icon } from "./Icon";
import { ScreenTitle } from "./ScreenTitle";

// Editor building blocks for screens without a Stitch export, composed only
// from DESIGN.md parts already used by the exports: the 000_base_scaffold
// headline, white rounded-[28px] cards with hairline borders, filled pill
// inputs, obsidian primary and surface-container secondary pill buttons.

/** Headline row with a circular close button (back to where the user came from). */
export function EditorTitle({ children }: { children: ReactNode }) {
  const { t } = useT("common");
  const navigate = useNavigate();
  return (
    <ScreenTitle
      trailing={
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-surface-container-lowest text-on-surface flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95 transition-transform"
        >
          <Icon name="close" className="text-[20px]" />
        </button>
      }
    >
      {children}
    </ScreenTitle>
  );
}

export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-5 flex flex-col gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({ id, label, hint, children }: { id?: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-label-md text-label-md text-on-surface">
        {label}
      </Label>
      {children}
      {hint && <span className="font-label-sm text-label-sm text-secondary">{hint}</span>}
    </div>
  );
}

export const primaryButtonClass =
  "w-full py-3.5 px-5 rounded-full bg-primary text-on-primary flex items-center justify-center gap-2 font-label-md text-label-md font-medium shadow-sm transition-transform active:scale-95 hover:opacity-90 disabled:opacity-60";

export function PrimaryButton({ children, icon, className, ...props }: React.ComponentProps<"button"> & { icon?: string }) {
  return (
    <button type="submit" {...props} className={cn(primaryButtonClass, className)}>
      {icon && <Icon name={icon} className="text-[18px]" />}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, icon, className, ...props }: React.ComponentProps<"button"> & { icon?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "w-full py-3.5 px-5 rounded-full bg-surface-container text-on-surface flex items-center justify-center gap-2 font-label-md text-label-md font-medium transition-all hover:bg-surface-container-high disabled:opacity-60",
        className,
      )}
    >
      {icon && <Icon name={icon} className="text-[18px]" />}
      {children}
    </button>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="font-label-md text-label-md text-error">
      {message}
    </p>
  );
}

/** Which child an item is for — shown only when the user has more than one. */
export function ChildField({ kids, value, onChange }: { kids: ChildSummary[]; value: string; onChange: (id: string) => void }) {
  const { t } = useT("calendar");
  if (kids.length < 2) return null;
  return (
    <Field id="child" label={t("form.child")}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="child" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {kids.map((k) => (
            <SelectItem key={k.id} value={k.id}>
              {k.firstName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * The global categories as a dropdown where any number can be ticked; the
 * chosen ones show as the exports' category pills. An archived category stays
 * listed only while it's still on the item.
 */
export function CategoriesField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useT("calendar");
  const { data: categories = [] } = useCategories();
  const categoryName = useCategoryName();
  const usable = categories.filter((c: CategoryDto) => !c.archived || value.includes(c.id));
  const chosen = value.flatMap((id) => usable.filter((c) => c.id === id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <Field id="categories" label={t("form.categories")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          id="categories"
          className="min-h-12 w-full rounded-[24px] bg-surface-container-low px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-surface-container transition-colors"
        >
          {chosen.length ? (
            <span className="flex flex-wrap gap-1.5 min-w-0">
              {chosen.map((c) => (
                <CategoryChip key={c.id} category={c} />
              ))}
            </span>
          ) : (
            <span className="px-1 font-body-md text-body-md text-secondary">{t("form.chooseCategories")}</span>
          )}
          <Icon name="expand_more" className="text-[20px] text-secondary shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn(menuContentClass, "w-[var(--radix-dropdown-menu-trigger-width)] max-h-80 overflow-y-auto")}>
          {usable.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={value.includes(c.id)}
              // Stay open: several can be ticked in one go.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(c.id)}
              className="px-2.5 py-2 pl-8 rounded-xl font-label-md text-label-md text-on-surface focus:bg-surface-container-low"
            >
              <Icon name={c.icon} className="text-[18px] text-secondary" />
              {categoryName(c)}
            </DropdownMenuCheckboxItem>
          ))}
          {value.length > 0 && (
            <DropdownMenuItem onSelect={() => onChange([])} className="px-2.5 py-2 pl-8 rounded-xl font-label-md text-label-md text-secondary focus:bg-surface-container-low">
              {t("form.clearCategories")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

/**
 * A date, typed the region's way ("31.07.2015" in DK, "07/31/2015" in the US;
 * any separator works) or picked from the calendar, whose caption has month
 * and year dropdowns so a birthday years back is two taps away. Value is
 * "YYYY-MM-DD"; `fromYear`/`toYear` bound the year dropdown.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  fromYear = new Date().getFullYear() - 100,
  toYear = new Date().getFullYear() + 10,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (day: string) => void;
  fromYear?: number;
  toYear?: number;
}) {
  const { t } = useT("common");
  const fmt = useFormat();
  const { pattern } = fmt.dateInput;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => fmt.dateInput.format(value));
  const [shown, setShown] = useState(value);
  const [invalid, setInvalid] = useState(false);
  // A new value from outside (loaded, or picked in the calendar) replaces the text.
  if (value !== shown) {
    setShown(value);
    setText(fmt.dateInput.format(value));
    setInvalid(false);
  }
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const placeholder = pattern.order.map((p) => t(`date.${p}`)).join(pattern.separator);
  const example = fmt.dateInput.format("2015-07-31");

  const commit = (input: string) => {
    if (!input.trim()) {
      setInvalid(false);
      if (value) {
        setShown("");
        onChange("");
      }
      return;
    }
    const day = fmt.dateInput.parse(input);
    setInvalid(!day);
    if (day) {
      setShown(day);
      setText(fmt.dateInput.format(day));
      if (day !== value) onChange(day);
    }
  };

  return (
    <Field id={id} label={label} hint={invalid ? <span role="alert" className="text-error">{t("date.invalid", { pattern: placeholder, example })}</span> : undefined}>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setText(e.target.value);
            // Commit as soon as it's a whole date, so the form can be sent without leaving the field.
            const day = fmt.dateInput.parse(e.target.value);
            if (day) {
              setInvalid(false);
              setShown(day);
              if (day !== value) onChange(day);
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          className={cn(
            "h-12 w-full rounded-full bg-surface-container-low pl-4 pr-12 font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container placeholder:text-secondary/60",
            invalid && "ring-2 ring-error"
          )}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            aria-label={t("date.pick")}
            className="absolute right-1 top-1 w-10 h-10 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container transition-colors"
          >
            <Icon name="calendar_today" className="text-[18px]" />
          </PopoverTrigger>
          <PopoverContent align="end" collisionPadding={16} className="w-[min(22rem,calc(100vw-2rem))] rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 p-space-lg shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)]">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              startMonth={new Date(fromYear, 0)}
              endMonth={new Date(toYear, 11)}
              selected={selected}
              defaultMonth={selected}
              onSelect={(d) => {
                if (!d) return;
                // react-day-picker gives local midnight; keep the calendar day.
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                onChange(key);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </Field>
  );
}

/** An editable list of short labels (event to-dos, packing items). */
export function LabelListField({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: ReactNode;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const { t } = useT("calendar");
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={t("form.itemLabel")}
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-12 w-full min-w-0 rounded-full bg-surface-container-low px-4 font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container"
            />
            <button
              type="button"
              aria-label={t("form.removeItem")}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="w-10 h-10 shrink-0 rounded-full bg-surface-container-low text-secondary flex items-center justify-center"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            aria-label={placeholder}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-12 w-full min-w-0 rounded-full bg-surface-container-low px-4 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:bg-surface-container"
          />
          <button
            type="button"
            aria-label={t("form.addItem")}
            onClick={add}
            className="w-10 h-10 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center"
          >
            <Icon name="add" className="text-[18px]" />
          </button>
        </div>
      </div>
    </Field>
  );
}

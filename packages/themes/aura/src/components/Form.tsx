import { useState, type ReactNode } from "react";
import type { CategoryDto, ChildSummary } from "@kidcom/shared";
import { useCategories, useFormat, useNavigate, useT } from "@kidcom/core";

import { CategoryChip } from "../calendar/CategoryChip";
import { cn } from "../lib/utils";
import { Calendar } from "../ui/calendar";
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

export function PrimaryButton({ children, icon, className, ...props }: React.ComponentProps<"button"> & { icon?: string }) {
  return (
    <button
      type="submit"
      {...props}
      className={cn(
        "w-full py-3.5 px-5 rounded-full bg-primary text-on-primary flex items-center justify-center gap-2 font-label-md text-label-md font-medium shadow-sm transition-transform active:scale-95 hover:opacity-90 disabled:opacity-60",
        className,
      )}
    >
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

/** The global categories as tappable chips (the exports' category pills). */
export function CategoryField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useT("calendar");
  const { data: categories = [] } = useCategories();
  const usable = categories.filter((c: CategoryDto) => !c.archived || c.id === value);
  return (
    <Field label={t("form.category")}>
      <div role="radiogroup" aria-label={t("form.category")} className="flex flex-wrap gap-2">
        {usable.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            onClick={() => onChange(value === c.id ? null : c.id)}
            className={cn("rounded-full transition-all", value === c.id ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : "opacity-80")}
          >
            <CategoryChip category={c} />
          </button>
        ))}
      </div>
    </Field>
  );
}

/** A day picked from the shadcn Calendar in a popover; value is "YYYY-MM-DD". */
export function DateField({ id, label, value, onChange }: { id: string; label: ReactNode; value: string; onChange: (day: string) => void }) {
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00Z`) : undefined;
  return (
    <Field id={id} label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          className="h-12 w-full rounded-full bg-surface-container-low px-4 flex items-center justify-between font-body-md text-body-md text-on-surface hover:bg-surface-container transition-colors"
        >
          <span>{selected ? fmt.date(selected, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : ""}</span>
          <Icon name="calendar_today" className="text-[18px] text-secondary" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 p-space-lg shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)]">
          <Calendar
            mode="single"
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

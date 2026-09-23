import { Children, type ReactNode } from "react";
import { Link } from "@kidcom/core";

import { cn } from "../lib/utils";
import { Icon } from "./Icon";

// The grouped list card (the Measurements card of kidcom_child_profile_1:
// white card, hairline dividers, label left, value/chevron right), used by
// the profile menu, account, preferences and billing screens.

export function MenuGroup({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <section className={cn("flex flex-col gap-space-xs", className)}>
      {title && <h2 className="px-1 font-title-md text-title-md text-on-surface">{title}</h2>}
      <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden border border-outline-variant/30 flex flex-col">
        {rows.map((row, i) => (
          <div key={i}>
            {i > 0 && <div className="border-t border-outline-variant/30" />}
            {row}
          </div>
        ))}
      </div>
    </section>
  );
}

type RowProps = {
  icon?: string;
  label: string;
  hint?: string;
  value?: ReactNode;
  badge?: number;
  danger?: boolean;
  trailing?: ReactNode;
};

function RowBody({ icon, label, hint, value, badge, danger, trailing, chevron }: RowProps & { chevron?: boolean }) {
  return (
    <>
      <span className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", danger ? "bg-error-container text-on-error-container" : "bg-surface-container-low text-on-surface")}>
            <Icon name={icon} className="text-[19px]" />
          </span>
        )}
        <span className="flex flex-col min-w-0">
          <span className={cn("font-label-md text-label-md truncate", danger ? "text-error" : "text-on-surface")}>{label}</span>
          {hint && <span className="font-micro-meta text-micro-meta text-secondary truncate normal-case tracking-normal font-medium">{hint}</span>}
        </span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {value !== undefined && <span className="font-label-md text-label-md text-secondary">{value}</span>}
        {badge ? <span className="min-w-5 h-5 px-1 rounded-full bg-unread-ink text-white text-[11px] font-bold flex items-center justify-center">{badge}</span> : null}
        {trailing}
        {chevron && <Icon name="chevron_right" className="text-secondary text-[20px]" />}
      </span>
    </>
  );
}

const rowClass = "w-full flex items-center justify-between gap-3 p-3.5 text-left hover:bg-surface-container/50 transition-colors";

export function MenuLink({ to, ...props }: RowProps & { to: string }) {
  return (
    <Link to={to} className={rowClass}>
      <RowBody {...props} chevron />
    </Link>
  );
}

export function MenuButton({ onClick, disabled, ...props }: RowProps & { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(rowClass, "disabled:opacity-50")}>
      <RowBody {...props} />
    </button>
  );
}

/** A row whose control (a switch, a radio) sits on the right. */
export function MenuItem(props: RowProps) {
  return (
    <div className="w-full flex items-center justify-between gap-3 p-3.5">
      <RowBody {...props} />
    </div>
  );
}

import type { ReactNode } from "react";

import { Icon } from "./Icon";

// A small generic persistent-nudge banner — nothing like this existed
// before (post-launch backlog Phase D): the closest precedent was
// InstallPrompt.tsx's fixed-bottom dismissible card, but that one is
// install-specific (localStorage-gated "shown once" logic baked in). This
// component is deliberately dumb — just the visual shell — so callers
// decide their own show/dismiss logic rather than this component
// accumulating install-prompt-style special cases over time.
export function Banner({
  icon,
  children,
  action,
  onDismiss,
}: {
  icon: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  return (
    <div className="bg-secondary-container/40 border border-secondary-container rounded-2xl p-4 flex items-start gap-3">
      <Icon name={icon} className="text-on-secondary-container text-[20px] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-body-md text-body-md text-on-surface">{children}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2 font-label-sm text-label-sm text-primary hover:text-primary-container transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      )}
    </div>
  );
}

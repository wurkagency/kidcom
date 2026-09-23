import type { ReactNode } from "react";

// The screen headline row from 000_base_scaffold ("Headline"), with an
// optional trailing slot for the screen's own controls.
export function ScreenTitle({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-4 mb-6">
      <div className="flex items-center gap-space-xs">
        <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">{children}</h2>
      </div>
      {trailing}
    </div>
  );
}

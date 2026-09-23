import type { SkinId } from "@kidcom/shared";

// A tiny, always-live mockup of a skin's actual tokens, not a static
// screenshot — it works by setting `data-skin` on a wrapper div and letting
// this app's existing CSS-variable cascade (apps/web/src/index.css) take it
// from there, same mechanism applySkin() uses on <html>, just scoped to a
// small subtree instead. That means it can never drift from what the skin
// actually looks like, and needs zero maintenance when a skin's tokens
// change. Nav rows sample --nav-* directly so the shape (edge-to-edge vs.
// floating pill) previews correctly too, not just the color palette.
export function SkinPreview({ skinId, className = "" }: { skinId: SkinId; className?: string }) {
  return (
    <div
      data-skin={skinId}
      className={`bg-surface rounded-xl overflow-hidden border border-outline-variant shrink-0 ${className}`}
      aria-hidden="true"
    >
      <div className="h-full flex flex-col justify-between p-2.5 gap-2">
        <div className="flex flex-col gap-1.5">
          <div className="h-2.5 w-2/3 rounded-full bg-primary" />
          <div className="h-1.5 w-1/2 rounded-full bg-on-surface-variant/40" />
        </div>
        <div className="flex-1 rounded-lg bg-surface-container-lowest shadow-sm p-2 flex flex-col gap-1.5 justify-center">
          <div className="h-1.5 w-3/4 rounded-full bg-on-surface/25" />
          <div className="h-1.5 w-1/2 rounded-full bg-on-surface/15" />
          <div className="h-4 w-8 rounded-md bg-secondary mt-0.5" />
        </div>
        <div
          className="flex items-center justify-around px-2 py-1.5 bg-nav-surface"
          style={{
            borderRadius: "var(--nav-radius)",
            margin: "0 var(--nav-inset-x)",
            boxShadow: "var(--nav-shadow)",
          }}
        >
          <span className="w-2 h-2 rounded-full bg-nav-icon-active" />
          <span className="w-2 h-2 rounded-full bg-nav-icon" />
          <span className="w-2 h-2 rounded-full bg-nav-icon" />
        </div>
      </div>
    </div>
  );
}

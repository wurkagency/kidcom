import * as SwitchPrimitives from "@radix-ui/react-switch";

type ToggleProps = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "default" | "lg";
  onColor?: string;
  offColor?: string;
  onKnobColor?: string;
  offKnobColor?: string;
  "aria-label"?: string;
};

// Built on Radix's Switch primitive (@radix-ui/react-switch — the same one
// shadcn/ui's generated ui/switch.tsx wraps) composed directly rather than
// through that generated wrapper: its border-inset sizing technique doesn't
// match this component's absolute-positioned knob, and every skin (including
// Greenkeeper/Sky) needs this to render pixel-identical to the hand-rolled
// <button>/<span> version it replaces. Radix's Root renders role="switch"
// and aria-checked natively, matching what this component set by hand before.
export function Toggle({
  checked,
  onToggle,
  disabled,
  size = "default",
  onColor = "bg-primary",
  offColor = "bg-surface-variant",
  onKnobColor = "bg-on-primary",
  offKnobColor = "bg-outline",
  "aria-label": ariaLabel,
}: ToggleProps) {
  const knobSize = size === "lg" ? "w-5 h-5" : "w-4 h-4";
  const knobOffset = size === "lg" ? "top-0.5" : "top-1";
  const knobRest = size === "lg" ? "translate-x-0.5" : "translate-x-1";

  return (
    <SwitchPrimitives.Root
      checked={checked}
      onCheckedChange={() => onToggle()}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`w-12 h-6 rounded-full relative transition-colors duration-300 shrink-0 disabled:opacity-60 ${
        checked ? onColor : offColor
      }`}
    >
      <SwitchPrimitives.Thumb
        className={`absolute ${knobOffset} ${knobSize} rounded-full shadow-sm transition-transform duration-300 ${
          checked ? `translate-x-6 ${onKnobColor}` : `${knobRest} ${offKnobColor}`
        }`}
      />
    </SwitchPrimitives.Root>
  );
}

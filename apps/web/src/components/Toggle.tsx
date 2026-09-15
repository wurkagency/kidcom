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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      disabled={disabled}
      className={`w-12 h-6 rounded-full relative transition-colors duration-300 shrink-0 disabled:opacity-60 ${
        checked ? onColor : offColor
      }`}
    >
      <span
        className={`absolute ${knobOffset} ${knobSize} rounded-full shadow-sm transition-transform duration-300 ${
          checked ? `translate-x-6 ${onKnobColor}` : `${knobRest} ${offKnobColor}`
        }`}
      />
    </button>
  );
}

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
};

// Built on Radix's ToggleGroup primitive (@radix-ui/react-toggle-group) in
// single-select mode, composed directly rather than through shadcn/ui's
// generated ui/toggle-group.tsx wrapper — its default data-[state=on]
// styling doesn't map onto this component's per-option selected-state
// classes, so this keeps the exact class logic the hand-rolled version used,
// just on Radix's primitive elements instead of a plain div/button pair.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: SegmentedControlProps<T>) {
  const wrapperClass =
    size === "md" ? "flex bg-surface-container-low rounded-xl p-1 gap-1" : "flex bg-surface-container-low rounded-lg p-1";
  const buttonClass = size === "md" ? "flex-1 py-2 px-4 rounded-lg" : "py-1.5 px-3 rounded-md";

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix lets the selected item toggle itself off (empty string) —
        // this control has no "none selected" state, so ignore that.
        if (next) onChange(next as T);
      }}
      className={wrapperClass}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={`${buttonClass} font-label-md text-label-md transition-colors ${
            value === option.value ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
          }`}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

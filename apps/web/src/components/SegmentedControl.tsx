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
    <div className={wrapperClass}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`${buttonClass} font-label-md text-label-md transition-colors ${
            value === option.value ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

import { useState, type InputHTMLAttributes } from "react";

import { Icon } from "./Icon";

type FormInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: string;
};

// Matches the input styling from docs/stitch_splitkid/create_your_account
// and tell_us_about_your_child: icon-left, rounded-xl, sage focus ring.
export function FormInput({ label, icon, id, type, ...inputProps }: FormInputProps) {
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label className="font-label-md text-label-md text-text-main ml-1" htmlFor={id}>
        {label}
      </label>
      <div className="relative group">
        {icon && (
          <Icon
            name={icon}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors"
          />
        )}
        <input
          id={id}
          type={isPassword ? (revealed ? "text" : "password") : type}
          className={`w-full bg-surface-container-lowest text-text-main font-body-md text-body-md ${
            icon ? "pl-12" : "pl-4"
          } ${isPassword ? "pr-12" : "pr-4"} py-4 rounded-xl outline-none transition-all focus:ring-2 focus:ring-primary shadow-sm`}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-text-main transition-colors"
          >
            <Icon name={revealed ? "visibility_off" : "visibility"} />
          </button>
        )}
      </div>
    </div>
  );
}

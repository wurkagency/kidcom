import { useState, type InputHTMLAttributes } from "react";

import { Icon } from "./Icon";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";

type FormInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: string;
};

// Built on shadcn/ui's Input + Label (src/components/ui/input.tsx,
// ui/label.tsx). Matches the input styling from
// docs/stitch_splitkid/create_your_account and tell_us_about_your_child:
// icon-left, rounded-xl, sage focus ring — overriding Input's own default
// classes via cn() so every skin (including Greenkeeper/Sky) still renders
// this identically to the hand-rolled <input> it replaces. The password
// reveal toggle has no shadcn equivalent and stays hand-rolled.
export function FormInput({ label, icon, id, type, ...inputProps }: FormInputProps) {
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Label className="font-label-md text-label-md text-on-surface ml-1" htmlFor={id}>
        {label}
      </Label>
      <div className="relative group">
        {icon && (
          <Icon
            name={icon}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors"
          />
        )}
        <Input
          id={id}
          type={isPassword ? (revealed ? "text" : "password") : type}
          className={cn(
            "w-full h-auto bg-surface-container-lowest text-on-surface font-body-md text-body-md",
            icon ? "pl-12" : "pl-4",
            isPassword ? "pr-12" : "pr-4",
            "py-4 rounded-xl border-0 outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
          )}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
          >
            <Icon name={revealed ? "visibility_off" : "visibility"} />
          </button>
        )}
      </div>
    </div>
  );
}

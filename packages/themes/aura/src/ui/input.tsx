import * as React from "react"
import { cn } from "../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Aura input (Stitch auth/forms): fully rounded filled bar.
        "h-12 w-full min-w-0 rounded-full bg-surface-container-low px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-outline focus:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-error",
        className
      )}
      {...props}
    />
  )
}

export { Input }

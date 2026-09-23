import * as React from "react"
import { cn } from "../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Aura: the input's filled surface, with the nested-surface radius (DESIGN.md Shapes).
        "flex field-sizing-content min-h-24 w-full rounded-[20px] bg-surface-container-low px-4 py-3 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-outline focus:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-error",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

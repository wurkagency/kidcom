import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils"
import { Slot } from "radix-ui"

// Aura buttons (Stitch exports): full pills, 48px tall, title-md labels.
//  default   — obsidian primary action ("Sign In", "Start 30-Day Free Trial")
//  secondary — surface-container-low pill (login social buttons)
//  outline   — white pill with soft shadow (signup social buttons)
//  mint      — secondary-container action pill (DESIGN.md "Action Pills")
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary shadow-md hover:bg-primary-container",
        destructive: "bg-error text-on-error shadow-md hover:bg-error/90",
        secondary: "bg-surface-container-low text-on-surface shadow-xs hover:bg-surface-container-high",
        outline: "bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low",
        mint: "bg-secondary-container text-on-secondary-fixed hover:bg-secondary-fixed-dim",
        ghost: "text-secondary hover:bg-surface-container hover:text-on-surface",
        link: "h-auto px-0 text-on-surface underline decoration-secondary underline-offset-4 hover:opacity-80",
      },
      size: {
        default: "h-12 px-6 font-title-md text-title-md",
        sm: "h-10 px-4 font-label-md text-label-md",
        icon: "size-12",
        "icon-sm": "size-10",
        "icon-xs": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

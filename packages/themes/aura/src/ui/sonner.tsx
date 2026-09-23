import { Toaster as Sonner, type ToasterProps } from "sonner"

import { Icon } from "../components/Icon"

// Aura toasts: light only (Aura has no dark variant), Material Symbols icons,
// colors from Aura tokens.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      className="toaster group"
      icons={{
        success: <Icon name="check_circle" className="text-[16px]" />,
        info: <Icon name="info" className="text-[16px]" />,
        warning: <Icon name="warning" className="text-[16px]" />,
        error: <Icon name="error" className="text-[16px]" />,
        loading: <Icon name="progress_activity" className="animate-spin text-[16px]" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-surface-container-lowest)",
          "--normal-text": "var(--color-on-surface)",
          "--normal-border": "var(--color-hairline)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

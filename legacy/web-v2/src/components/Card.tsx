import { Card as ShadcnCard } from "./ui/card";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
};

export function Card({ children, className = "", padded = true }: CardProps) {
  return (
    <ShadcnCard
      className={`border-0 bg-surface-container-lowest text-inherit rounded-2xl shadow-sm ${padded ? "p-4" : ""} ${className}`.trim()}
    >
      {children}
    </ShadcnCard>
  );
}

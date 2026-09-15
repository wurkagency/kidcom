type CardProps = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
};

export function Card({ children, className = "", padded = true }: CardProps) {
  return (
    <div
      className={`bg-surface-container-lowest rounded-2xl shadow-sm ${padded ? "p-4" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

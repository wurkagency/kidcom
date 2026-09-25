import type { CategoryDto } from "@kinnd/shared";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { useCategoryName } from "./people";
import { toneOf } from "./tones";

/** The uppercase category pill on event cards and tasks ("ROUTINE", "HEALTH"). */
export function CategoryChip({ category, className }: { category: CategoryDto | undefined; className?: string }) {
  const name = useCategoryName();
  if (!category) return null;
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full", toneOf(category.tone).chip, className)}>
      <Icon name={category.icon} className="text-[14px]" />
      <span className="font-micro-meta text-micro-meta uppercase font-bold tracking-wide">{name(category)}</span>
    </div>
  );
}

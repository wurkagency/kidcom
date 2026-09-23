import { mediaUrl } from "@kidcom/core";

import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

/**
 * A person's or child's photo from a media asset id, falling back to their
 * initials while loading, when there is no photo, or when it fails to load.
 */
export function PersonAvatar({
  mediaId,
  initials,
  className,
}: {
  mediaId: string | null | undefined;
  initials: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {mediaId && <AvatarImage src={mediaUrl(mediaId)} alt="" className="object-cover" />}
      <AvatarFallback className="bg-surface-container-high font-label-sm text-label-sm text-on-surface">
        {initials.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

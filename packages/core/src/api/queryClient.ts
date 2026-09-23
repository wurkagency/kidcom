import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./client";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A 4xx is an answer, not a transient failure — don't hammer the API.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: true,
      },
    },
  });
}

/** Stable query keys, so invalidations can't drift from the queries they target. */
export const queryKeys = {
  me: ["me"] as const,
  children: ["children"] as const,
  child: (childId: string) => ["children", childId] as const,
};

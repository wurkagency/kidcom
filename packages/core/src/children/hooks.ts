import { useQuery } from "@tanstack/react-query";
import type { ChildSummary } from "@kidcom/shared";

import { api } from "../api/client";
import { queryKeys } from "../api/queryClient";

/** Every child the signed-in user has access to, oldest-created first. */
export function useChildren() {
  return useQuery({
    queryKey: queryKeys.children,
    queryFn: async () => (await api.get<{ children: ChildSummary[] }>("/children")).children,
  });
}

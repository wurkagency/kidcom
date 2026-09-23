import { useQuery } from "@tanstack/react-query";
import type { ChildSummary } from "@kidcom/shared";

import { api } from "../api/client";
import { queryKeys } from "../api/queryClient";
import { useMe } from "../auth/hooks";

/** Every child the signed-in user has access to, oldest-created first. */
export function useChildren() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: queryKeys.children,
    queryFn: async () => (await api.get<{ children: ChildSummary[] }>("/children")).children,
    // Signed out there is nothing to fetch (and the API would answer 401).
    enabled: Boolean(me),
  });
}

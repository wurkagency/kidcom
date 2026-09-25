import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ChildDetail,
  ChildScheduleResponse,
  ClaimListItemRequest,
  CreateChildRequest,
  CreateChildResponse,
  CreateEmergencyContactRequest,
  CreateGrowthEntryRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  CreateListItemRequest,
  CreateMedicalInfoRequest,
  EmergencyContactDto,
  GrowthEntryDto,
  ListItemDto,
  ListItemType,
  ListItemsResponse,
  MedicalInfoEntry,
  RelationshipType,
  UpdateChildRequest,
  UpdateEmergencyContactRequest,
  UpdateListItemRequest,
  UpdateMedicalInfoRequest,
  UpdateScheduleOccurrenceRequest,
} from "@kinnd/shared";

import { api } from "../api/client";
import { queryKeys } from "../api/queryClient";

// Children, lists and health: the Phase 5 screens' data.

const enc = encodeURIComponent;
const child = (childId: string) => `/children/${enc(childId)}`;

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

export function useChild(childId: string | undefined) {
  return useQuery({
    queryKey: ["child", childId],
    queryFn: () => api.get<ChildDetail>(child(childId!)),
    enabled: Boolean(childId),
  });
}

function refreshChildren(qc: QueryClient, childId?: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.children });
  if (childId) void qc.invalidateQueries({ queryKey: ["child", childId] });
}

export function useCreateChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChildRequest) => api.post<CreateChildResponse>("/children", body),
    onSuccess: () => refreshChildren(qc),
  });
}

export function useUpdateChild(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateChildRequest) => api.patch<ChildDetail>(child(childId), body),
    onSuccess: () => refreshChildren(qc, childId),
  });
}

export function useUpdateMemberRelationship(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; relationship: RelationshipType }) =>
      api.patch<void>(`${child(childId)}/family/${enc(v.userId)}`, { relationship: v.relationship }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["family", childId] }),
  });
}

export function useRemoveMember(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete<void>(`${child(childId)}/family/${enc(userId)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["family", childId] }),
  });
}

export function useCreateInvite() {
  return useMutation({ mutationFn: (body: CreateInviteRequest) => api.post<CreateInviteResponse>("/invites", body) });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Necessities or wishlist across the selected children; refreshed every 20 s so claims show up. */
export function useLists(childIds: string[] | null, type: ListItemType) {
  const ids = childIds ? [...childIds].sort().join(",") : "";
  return useQuery({
    queryKey: ["lists", type, ids],
    queryFn: async () => (await api.get<ListItemsResponse>(`/lists?type=${type}${ids ? `&childIds=${ids.split(",").map(enc).join(",")}` : ""}`)).items,
    refetchInterval: 20_000,
  });
}

export function useListItem(childId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: ["list-item", itemId],
    queryFn: () => api.get<ListItemDto>(`${child(childId!)}/lists/${enc(itemId!)}`),
    enabled: Boolean(childId && itemId),
  });
}

const refreshLists = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["lists"] });

export function useCreateListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { childId: string; body: CreateListItemRequest }) => api.post<ListItemDto>(`${child(v.childId)}/lists`, v.body),
    onSuccess: () => void refreshLists(qc),
  });
}

export function useUpdateListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { childId: string; itemId: string; body: UpdateListItemRequest }) =>
      api.patch<ListItemDto>(`${child(v.childId)}/lists/${enc(v.itemId)}`, v.body),
    onSuccess: () => void refreshLists(qc),
  });
}

export function useDeleteListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { childId: string; itemId: string }) => api.delete<void>(`${child(v.childId)}/lists/${enc(v.itemId)}`),
    onSuccess: () => void refreshLists(qc),
  });
}

/** "I'll get it", release, or edit your claim note. */
export function useClaimListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { item: ListItemDto; body: ClaimListItemRequest }) =>
      api.patch<ListItemDto>(`${child(v.item.childId)}/lists/${enc(v.item.id)}/claim`, v.body),
    onSuccess: (updated) => {
      for (const [key, list] of qc.getQueriesData<ListItemDto[]>({ queryKey: ["lists"] })) {
        if (list) qc.setQueryData(key, list.map((i) => (i.id === updated.id ? updated : i)));
      }
    },
    onSettled: () => void refreshLists(qc),
  });
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export function useGrowthEntries(childId: string | undefined) {
  return useQuery({
    queryKey: ["growth", childId],
    queryFn: async () => (await api.get<{ items: GrowthEntryDto[] }>(`${child(childId!)}/growth-entries`)).items,
    enabled: Boolean(childId),
  });
}

export function useAddGrowthEntry(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGrowthEntryRequest) => api.post<GrowthEntryDto>(`${child(childId)}/growth-entries`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth", childId] }),
  });
}

export function useDeleteGrowthEntry(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`${child(childId)}/growth-entries/${enc(id)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth", childId] }),
  });
}

// ---------------------------------------------------------------------------
// Medical info, contacts, health programme
// ---------------------------------------------------------------------------

export function useMedicalInfo(childId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["medical", childId],
    queryFn: async () => (await api.get<{ items: MedicalInfoEntry[] }>(`${child(childId!)}/medical-info`)).items,
    enabled: Boolean(childId) && enabled,
    retry: false, // 403 when the member hasn't been given medical access
  });
}

export function useSaveMedicalInfo(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; body: CreateMedicalInfoRequest | UpdateMedicalInfoRequest }) =>
      v.id
        ? api.patch<MedicalInfoEntry>(`${child(childId)}/medical-info/${enc(v.id)}`, v.body)
        : api.post<MedicalInfoEntry>(`${child(childId)}/medical-info`, v.body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["medical", childId] }),
  });
}

export function useDeleteMedicalInfo(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`${child(childId)}/medical-info/${enc(id)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["medical", childId] }),
  });
}

export function useEmergencyContacts(childId: string | undefined) {
  return useQuery({
    queryKey: ["contacts", childId],
    queryFn: async () => (await api.get<{ items: EmergencyContactDto[] }>(`${child(childId!)}/emergency-contacts`)).items,
    enabled: Boolean(childId),
  });
}

export function useSaveEmergencyContact(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; body: CreateEmergencyContactRequest | UpdateEmergencyContactRequest }) =>
      v.id
        ? api.patch<EmergencyContactDto>(`${child(childId)}/emergency-contacts/${enc(v.id)}`, v.body)
        : api.post<EmergencyContactDto>(`${child(childId)}/emergency-contacts`, v.body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contacts", childId] }),
  });
}

export function useDeleteEmergencyContact(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`${child(childId)}/emergency-contacts/${enc(id)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contacts", childId] }),
  });
}

export function useHealthSchedule(childId: string | undefined) {
  return useQuery({
    queryKey: ["schedule", childId],
    queryFn: () => api.get<ChildScheduleResponse>(`${child(childId!)}/schedule`),
    enabled: Boolean(childId),
  });
}

/** Tick an item of the health programme done (or undo), optimistically. */
export function useUpdateScheduleItem(childId: string) {
  const qc = useQueryClient();
  const key = ["schedule", childId];
  return useMutation({
    mutationFn: (v: { templateId: string; sequence: number; body: UpdateScheduleOccurrenceRequest }) =>
      api.patch<void>(`${child(childId)}/schedule/${enc(v.templateId)}/occurrences/${v.sequence}`, v.body),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<ChildScheduleResponse>(key);
      if (before && v.body.completed !== undefined) {
        qc.setQueryData<ChildScheduleResponse>(key, {
          ...before,
          items: before.items.map((i) =>
            i.templateId === v.templateId && i.sequence === v.sequence
              ? { ...i, completed: v.body.completed!, completedAt: v.body.completed ? new Date().toISOString() : null }
              : i,
          ),
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => ctx?.before && qc.setQueryData(key, ctx.before),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CalendarEventDto,
  CategoriesResponse,
  CategoryDto,
  ChildFamilyMember,
  ChildNoteDto,
  ChildOverview,
  CreateCalendarEventRequest,
  CreateCategoryRequest,
  CreateChildNoteRequest,
  CreateSchoolLessonRequest,
  CreateSwapRequestRequest,
  CreateTaskRequest,
  CustodyPlanStatusResponse,
  HandoverPackingItemDto,
  OverviewResponse,
  SchoolLessonDto,
  SetCustodyPlanRequest,
  SetHandoverPackingRequest,
  SwapRequestDto,
  TaskDto,
  UpdateCalendarEventRequest,
  UpdateCategoryRequest,
  UpdateChildNoteRequest,
  UpdateSchoolLessonRequest,
  UpdateTaskRequest,
} from "@kidcom/shared";

import { api } from "../api/client";
import type { DateKey } from "./dates";

const enc = encodeURIComponent;
const child = (childId: string) => `/children/${enc(childId)}`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Everything the Today and calendar screens show, for a date range and set of children. */
export function useOverview(range: { from: DateKey; to: DateKey }, childIds: string[] | null) {
  const ids = childIds ? [...childIds].sort() : null;
  return useQuery({
    queryKey: ["overview", range.from, range.to, ids?.join(",") ?? "all"],
    queryFn: () =>
      api.get<OverviewResponse>(
        `/overview?from=${range.from}&to=${range.to}${ids && ids.length ? `&childIds=${ids.map(enc).join(",")}` : ""}`,
      ),
    enabled: !ids || ids.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<CategoriesResponse>("/categories")).categories,
    staleTime: 5 * 60_000,
  });
}

/** id → category, for resolving `categoryId` on events, tasks and notes. */
export function useCategoryMap(): Map<string, CategoryDto> {
  const { data } = useCategories();
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);
}

export function useCalendarEvent(childId: string | undefined, eventId: string | undefined) {
  return useQuery({
    queryKey: ["event", childId, eventId],
    queryFn: () => api.get<CalendarEventDto>(`${child(childId!)}/calendar-events/${enc(eventId!)}`),
    enabled: Boolean(childId && eventId),
  });
}

export function useCustodyPlan(childId: string | undefined) {
  return useQuery({
    queryKey: ["custody-plan", childId],
    queryFn: () => api.get<CustodyPlanStatusResponse>(`${child(childId!)}/custody-plan`),
    enabled: Boolean(childId),
  });
}

/** Everyone with access to a child (names for "Handled by", assignees). */
export function useChildFamily(childId: string | undefined) {
  return useQuery({
    queryKey: ["family", childId],
    queryFn: async () => (await api.get<{ members: ChildFamilyMember[] }>(`${child(childId!)}/family`)).members,
    enabled: Boolean(childId),
    staleTime: 60_000,
  });
}

export function useChildNotes(childId: string | undefined) {
  return useQuery({
    queryKey: ["notes", childId],
    queryFn: async () => (await api.get<{ notes: ChildNoteDto[] }>(`${child(childId!)}/notes`)).notes,
    enabled: Boolean(childId),
  });
}

export function useChildTasks(childId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", childId],
    queryFn: async () => (await api.get<{ tasks: TaskDto[] }>(`${child(childId!)}/tasks`)).tasks,
    enabled: Boolean(childId),
  });
}

export function useSchoolLessons(childId: string | undefined) {
  return useQuery({
    queryKey: ["lessons", childId],
    queryFn: async () => (await api.get<{ lessons: SchoolLessonDto[] }>(`${child(childId!)}/school-lessons`)).lessons,
    enabled: Boolean(childId),
  });
}

// ---------------------------------------------------------------------------
// Writes. Every write refreshes the overview; toggles update it optimistically.
// ---------------------------------------------------------------------------

const refreshOverview = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["overview"] });

/** Applies `update` to one child's slice of every cached overview; returns a rollback. */
function patchOverview(qc: QueryClient, childId: string, update: (c: ChildOverview) => ChildOverview) {
  const snapshots = qc.getQueriesData<OverviewResponse>({ queryKey: ["overview"] });
  for (const [key, data] of snapshots) {
    if (!data) continue;
    qc.setQueryData<OverviewResponse>(key, {
      ...data,
      children: data.children.map((c) => (c.childId === childId ? update(c) : c)),
    });
  }
  return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

function useOptimistic<V>(
  childId: string,
  request: (vars: V) => Promise<unknown>,
  update: (c: ChildOverview, vars: V) => ChildOverview,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: ["overview"] });
      return { rollback: patchOverview(qc, childId, (c) => update(c, vars)) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => refreshOverview(qc),
  });
}

function useWrite<V, R>(request: (vars: V) => Promise<R>, alsoInvalidate: unknown[][] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void refreshOverview(qc);
      alsoInvalidate.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
    },
  });
}

// Tasks
export const useToggleTask = (childId: string) =>
  useOptimistic(
    childId,
    (v: { taskId: string; completed: boolean }) =>
      api.patch<TaskDto>(`${child(childId)}/tasks/${enc(v.taskId)}`, { completed: v.completed }),
    (c, v) => ({
      ...c,
      tasks: c.tasks.map((t) => (t.id === v.taskId ? { ...t, completedAt: v.completed ? new Date().toISOString() : null } : t)),
    }),
  );
export const useCreateTask = (childId: string) =>
  useWrite((body: CreateTaskRequest) => api.post<TaskDto>(`${child(childId)}/tasks`, body), [["tasks", childId]]);
export const useUpdateTask = (childId: string) =>
  useWrite((v: { taskId: string; body: UpdateTaskRequest }) => api.patch<TaskDto>(`${child(childId)}/tasks/${enc(v.taskId)}`, v.body), [["tasks", childId]]);
export const useDeleteTask = (childId: string) =>
  useWrite((taskId: string) => api.delete<void>(`${child(childId)}/tasks/${enc(taskId)}`), [["tasks", childId]]);

// Shared notes
export const useCreateNote = (childId: string) =>
  useWrite((body: CreateChildNoteRequest) => api.post<ChildNoteDto>(`${child(childId)}/notes`, body), [["notes", childId]]);
export const useUpdateNote = (childId: string) =>
  useWrite((v: { noteId: string; body: UpdateChildNoteRequest }) => api.patch<ChildNoteDto>(`${child(childId)}/notes/${enc(v.noteId)}`, v.body), [["notes", childId]]);
export const useDeleteNote = (childId: string) =>
  useWrite((noteId: string) => api.delete<void>(`${child(childId)}/notes/${enc(noteId)}`), [["notes", childId]]);

// Events
export const useToggleChecklistItem = (childId: string) =>
  useOptimistic(
    childId,
    (v: { eventId: string; itemId: string; isChecked: boolean }) =>
      api.patch<CalendarEventDto>(`${child(childId)}/calendar-events/${enc(v.eventId)}/checklist/${enc(v.itemId)}`, { isChecked: v.isChecked }),
    (c, v) => ({
      ...c,
      events: c.events.map((e) =>
        e.id === v.eventId ? { ...e, checklist: e.checklist.map((i) => (i.id === v.itemId ? { ...i, isChecked: v.isChecked } : i)) } : e,
      ),
    }),
  );
export const useCreateEvent = (childId: string) =>
  useWrite((body: CreateCalendarEventRequest) => api.post<CalendarEventDto>(`${child(childId)}/calendar-events`, body));
export const useUpdateEvent = (childId: string) =>
  useWrite(
    (v: { eventId: string; body: UpdateCalendarEventRequest }) =>
      api.patch<CalendarEventDto>(`${child(childId)}/calendar-events/${enc(v.eventId)}`, v.body),
    [["event"]],
  );
export const useDeleteEvent = (childId: string) =>
  useWrite((eventId: string) => api.delete<void>(`${child(childId)}/calendar-events/${enc(eventId)}`), [["event"]]);

// Swaps
export const useCreateSwap = (childId: string) =>
  useWrite((body: CreateSwapRequestRequest) => api.post<SwapRequestDto>(`${child(childId)}/swap-requests`, body));
export const useResolveSwap = (childId: string) =>
  useWrite((v: { swapId: string; status: "APPROVED" | "DECLINED" }) =>
    api.patch<SwapRequestDto>(`${child(childId)}/swap-requests/${enc(v.swapId)}`, { status: v.status }),
  );

// Handover packing
type PackingResponse = { forDate: string; items: HandoverPackingItemDto[] };
export const useTogglePacking = (childId: string) =>
  useOptimistic(
    childId,
    (v: { itemId: string; packed: boolean }) => api.patch<PackingResponse>(`${child(childId)}/handover-packing/${enc(v.itemId)}`, { packed: v.packed }),
    (c, v) => ({ ...c, packing: { ...c.packing, items: c.packing.items.map((i) => (i.id === v.itemId ? { ...i, packed: v.packed } : i)) } }),
  );
export const useSetPacking = (childId: string) =>
  useWrite((body: SetHandoverPackingRequest) => api.put<PackingResponse>(`${child(childId)}/handover-packing`, body));

// School timetable
export const useCreateLesson = (childId: string) =>
  useWrite((body: CreateSchoolLessonRequest) => api.post<SchoolLessonDto>(`${child(childId)}/school-lessons`, body), [["lessons", childId]]);
export const useUpdateLesson = (childId: string) =>
  useWrite((v: { lessonId: string; body: UpdateSchoolLessonRequest }) =>
    api.patch<SchoolLessonDto>(`${child(childId)}/school-lessons/${enc(v.lessonId)}`, v.body),
  [["lessons", childId]]);
export const useDeleteLesson = (childId: string) =>
  useWrite((lessonId: string) => api.delete<void>(`${child(childId)}/school-lessons/${enc(lessonId)}`), [["lessons", childId]]);

// Custody plan
export const useSetCustodyPlan = (childId: string) =>
  useWrite((body: SetCustodyPlanRequest) => api.put(`${child(childId)}/custody-plan`, body), [["custody-plan", childId]]);

// Categories
export const useCreateCategory = () =>
  useWrite((body: CreateCategoryRequest) => api.post<CategoryDto>("/categories", body), [["categories"]]);
export const useUpdateCategory = () =>
  useWrite((v: { id: string; body: UpdateCategoryRequest }) => api.patch<CategoryDto>(`/categories/${enc(v.id)}`, v.body), [["categories"]]);
export const useDeleteCategory = () => useWrite((id: string) => api.delete<void>(`/categories/${enc(id)}`), [["categories"]]);

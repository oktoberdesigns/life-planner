import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { todayIn } from "../shared/dates";
import type { AppState, Level, Task, HabitLog } from "../shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: { "content-type": "application/json", "x-lp": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong");
  return data as T;
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, refetchInterval: 30_000, retry: false } },
});

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<{ owner: boolean; configured: boolean }>("/auth/me"), refetchInterval: false });
}
export function useAppState() {
  return useQuery({ queryKey: ["state"], queryFn: () => api<AppState>("/state") });
}

export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}
export const useToday = (tz?: string) => todayIn(tz, useNow(60_000));

/** Every write goes through here: update the screen instantly, then re-sync. */
export function useActions(today: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["state"] });
  const patchState = (fn: (s: AppState) => AppState) => qc.setQueryData<AppState>(["state"], (s) => (s ? fn(s) : s));
  const run = async <T,>(p: Promise<T>): Promise<T> => { try { return await p; } finally { refresh(); } };

  return {
    refresh,
    setEnergy: (level: Level) => {
      patchState((s) => ({ ...s, energy: { ...s.energy, [today]: level } }));
      return run(api("/energy", "PUT", { level, day: today }));
    },
    addTask: (body: Partial<Task>) => run(api<Task>("/tasks", "POST", body)),
    patchTask: (id: number, body: Partial<Task>) => {
      patchState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...body } : t)) }));
      return run(api<Task>(`/tasks/${id}`, "PATCH", body));
    },
    pullTask: (id: number) => {
      patchState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, pulled_on: today } : t)) }));
      return run(api(`/tasks/${id}/pull`, "POST", {}));
    },
    deleteTask: (id: number) => {
      patchState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
      return run(api(`/tasks/${id}`, "DELETE"));
    },
    logHabit: (habitId: number, day: string, status: "done" | "rest" | null) => {
      patchState((s) => {
        const rest = s.habit_logs.filter((l) => !(l.habit_id === habitId && l.day === day));
        const logs: HabitLog[] = status ? [...rest, { habit_id: habitId, day, status }] : rest;
        return { ...s, habit_logs: logs };
      });
      return run(api(`/habits/${habitId}/log`, "PUT", { day, status }));
    },
    create: (res: string, body: unknown) => run(api<any>(`/${res}`, "POST", body)),
    update: (res: string, id: number, body: unknown) => run(api<any>(`/${res}/${id}`, "PATCH", body)),
    remove: (res: string, id: number) => run(api(`/${res}/${id}`, "DELETE")),
    post: (path: string, body: unknown = {}) => run(api<any>(path, "POST", body)),
    saveSettings: (body: unknown) => run(api("/settings", "PUT", body)),
  };
}
export type Actions = ReturnType<typeof useActions>;

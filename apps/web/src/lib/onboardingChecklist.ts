import type { MyProfileView } from "../api/client";

export type ChecklistStepId = "profile" | "city" | "message";

export const CHECKLIST_WINDOW_DAYS = 14;

const key = (personId: string, name: string) => `alma.checklist.${personId}.${name}`;

export function readFlag(personId: string, name: string): boolean {
  try {
    return window.localStorage.getItem(key(personId, name)) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(personId: string, name: string): void {
  try {
    window.localStorage.setItem(key(personId, name), "1");
  } catch {
    /* private mode or storage full: the checklist just forgets, which is fine */
  }
}

export type ChecklistInput = {
  profile: Pick<MyProfileView, "batchYear" | "residenceCity" | "createdAt">;
  hasThreads: boolean;
  cityVisited: boolean;
};

export function checklistSteps(input: ChecklistInput): Record<ChecklistStepId, boolean> {
  return {
    profile: input.profile.batchYear != null && Boolean(input.profile.residenceCity?.trim()),
    city: input.cityVisited,
    message: input.hasThreads,
  };
}

export function isNewEnough(createdAt: string, now: number): boolean {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return now - t <= CHECKLIST_WINDOW_DAYS * 24 * 3600 * 1000;
}

export function doneCount(steps: Record<ChecklistStepId, boolean>): number {
  return Object.values(steps).filter(Boolean).length;
}

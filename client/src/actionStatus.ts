import { BadgeTone } from "./components/Badge.js";
import { ActionStatus } from "./api.js";

export const ACTION_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// ui-spec.md §3 — each status has its own tone, and the label text always
// carries the meaning.
export function actionStatusTone(status: ActionStatus): BadgeTone {
  if (status === "PLANNED") return "pale";
  if (status === "IN_PROGRESS") return "warning";
  if (status === "COMPLETED") return "success";
  return "neutral";
}

export function isTerminalAction(status: ActionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

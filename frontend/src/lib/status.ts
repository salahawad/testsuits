import { badgeToneClasses, type BadgeTone } from "../components/ui/Badge";

// Status / priority → Badge tone. Single source of truth — callers build
// `<Badge tone={execStatusTone(e.status)}>` instead of hand-rolling className
// strings. When the design system changes (e.g. a new dark variant), the tone
// map in Badge.tsx updates and every callsite picks it up automatically.

export function execStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PASSED": return "success";
    case "FAILED": return "danger";
    case "BLOCKED": return "warning";
    case "SKIPPED": return "neutral";
    case "PENDING":
    default: return "neutral";
  }
}

export function runStatusTone(status: string): BadgeTone {
  switch (status) {
    case "COMPLETED": return "success";
    case "IN_PROGRESS": return "info";
    case "ARCHIVED": return "neutral";
    case "DRAFT":
    default: return "neutral";
  }
}

export function priorityTone(priority: string): BadgeTone {
  switch (priority) {
    case "CRITICAL": return "danger";
    case "HIGH": return "warning";
    case "MEDIUM": return "info";
    case "LOW":
    default: return "neutral";
  }
}

export function milestoneStatusTone(status: string): BadgeTone {
  switch (status) {
    case "RELEASED": return "success";
    case "ACTIVE": return "info";
    case "CANCELLED": return "neutral";
    case "PLANNED":
    default: return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Backward-compat colour maps for callers that build className strings
// directly (e.g. `<span className={`badge ${runStatusColors[status]}`}>`).
// Internally these route through `badgeToneClasses`, so a single dark-mode
// tweak in Badge.tsx propagates everywhere. Prefer `<Badge tone={...}>` for
// new code.

function toneMap(pick: (v: string) => BadgeTone, values: readonly string[]): Record<string, string> {
  return Object.fromEntries(values.map((v) => [v, badgeToneClasses[pick(v)]]));
}

export const execStatusColors: Record<string, string> = toneMap(execStatusTone, [
  "PENDING", "PASSED", "FAILED", "BLOCKED", "SKIPPED",
]);

export const runStatusColors: Record<string, string> = toneMap(runStatusTone, [
  "DRAFT", "IN_PROGRESS", "COMPLETED", "ARCHIVED",
]);

export const priorityColors: Record<string, string> = toneMap(priorityTone, [
  "LOW", "MEDIUM", "HIGH", "CRITICAL",
]);

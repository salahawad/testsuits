export const execStatusColors: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  PASSED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  BLOCKED: "bg-amber-100 text-amber-800",
  SKIPPED: "bg-slate-200 text-slate-600",
};

export const priorityColors: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export const runStatusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-slate-200 text-slate-600",
};

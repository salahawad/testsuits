export const TEST_LEVELS = ["SMOKE", "SANITY", "REGRESSION", "ADVANCED", "EXPLORATORY"] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

// Platforms, connectivities, and locales used to live here as hardcoded
// constants. They are now per-company data — see lib/configOptions.ts and
// the Company settings "Test run options" panel.

export const testLevelColors: Record<TestLevel, string> = {
  SMOKE: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  SANITY: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
  REGRESSION: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  ADVANCED: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  EXPLORATORY: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200",
};

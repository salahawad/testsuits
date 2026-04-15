export const TEST_LEVELS = ["SMOKE", "SANITY", "REGRESSION", "ADVANCED", "EXPLORATORY"] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

export const PLATFORMS = ["WEB", "WINDOWS", "MACOS", "ANDROID", "IOS"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONNECTIVITY = ["ONLINE", "OFFLINE"] as const;
export type Connectivity = (typeof CONNECTIVITY)[number];

export const testLevelColors: Record<TestLevel, string> = {
  SMOKE: "bg-amber-100 text-amber-800",
  SANITY: "bg-teal-100 text-teal-800",
  REGRESSION: "bg-blue-100 text-blue-800",
  ADVANCED: "bg-violet-100 text-violet-800",
  EXPLORATORY: "bg-slate-100 text-slate-700",
};

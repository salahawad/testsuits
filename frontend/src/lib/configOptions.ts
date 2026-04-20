import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type ConfigKind = "PLATFORM" | "CONNECTIVITY" | "LOCALE";

export type ConfigOption = {
  id: string;
  kind: ConfigKind;
  code: string;
  label: string;
  sortOrder: number;
  deletedAt: string | null;
};

/**
 * Fetch every TestConfigOption for the caller's company, including
 * soft-deleted rows. Soft-deleted options still appear in historical runs, so
 * the label lookup must always include them. Active-only filtering happens in
 * the caller (e.g. the run-creation form), not at the query layer.
 */
export function useConfigOptions() {
  return useQuery<ConfigOption[]>({
    queryKey: ["test-config-options"],
    queryFn: async () =>
      (await api.get("/test-config-options", { params: { includeDeleted: true } })).data,
    staleTime: 60_000,
  });
}

export function activeOf(options: ConfigOption[] | undefined, kind: ConfigKind): ConfigOption[] {
  return (options ?? []).filter((o) => o.kind === kind && !o.deletedAt);
}

/**
 * Return a lookup that resolves a code to its human label, falling back to
 * the code itself if the option has been fully removed from storage. This is
 * the safe call for anything that displays a value on a historical run.
 */
export function makeLabelLookup(options: ConfigOption[] | undefined, kind: ConfigKind) {
  const map = new Map<string, string>();
  for (const o of options ?? []) {
    if (o.kind === kind) map.set(o.code, o.label);
  }
  return (code: string | null | undefined): string => {
    if (!code) return "";
    return map.get(code) ?? code;
  };
}

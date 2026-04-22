import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bug, ExternalLink, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { execStatusTone } from "../lib/status";
import { Badge } from "./ui/Badge";
import { Spinner } from "./Spinner";
import { logger } from "../lib/logger";
import { makeLabelLookup, useConfigOptions } from "../lib/configOptions";
import { useConfirm } from "./ui/ConfirmDialog";

type Status = "PENDING" | "PASSED" | "FAILED" | "BLOCKED" | "SKIPPED";
const STATUSES: Status[] = ["PASSED", "FAILED", "BLOCKED", "SKIPPED"];

export type ResultRow = {
  id: string;
  platform: string | null;
  connectivity: string | null;
  locale: string;
  status: Status;
  failureReason: string | null;
  actualResult: string | null;
  notes: string | null;
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
};

type Props = {
  executionId: string;
  runId: string;
  results: ResultRow[];
  jiraReady: boolean;
};

type Labeller = (code: string | null | undefined) => string;

function comboLabel(
  r: ResultRow,
  t: (k: string) => string,
  platform: Labeller,
  connectivity: Labeller,
  locale: Labeller,
): string {
  const parts: string[] = [];
  if (r.platform) parts.push(platform(r.platform));
  if (r.connectivity) parts.push(connectivity(r.connectivity));
  if (r.locale) parts.push(locale(r.locale));
  return parts.length ? parts.join(" · ") : t("runs.matrix.default_combo");
}

function aggregate(results: ResultRow[]): { status: Status; failing: ResultRow[]; pending: number; done: number } {
  const failing = results.filter((r) => r.status === "FAILED");
  const pending = results.filter((r) => r.status === "PENDING").length;
  const done = results.length - pending;
  let status: Status = "PENDING";
  if (failing.length) status = "FAILED";
  else if (results.some((r) => r.status === "BLOCKED")) status = "BLOCKED";
  else if (pending > 0) status = "PENDING";
  else if (results.every((r) => r.status === "SKIPPED")) status = "SKIPPED";
  else status = "PASSED";
  return { status, failing, pending, done };
}

export function RunResultMatrix({ executionId, runId, results, jiraReady }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const agg = useMemo(() => aggregate(results), [results]);
  const { data: configOptions } = useConfigOptions();
  const platformLabel = makeLabelLookup(configOptions, "PLATFORM");
  const connectivityLabel = makeLabelLookup(configOptions, "CONNECTIVITY");
  const localeLabel = makeLabelLookup(configOptions, "LOCALE");
  const label = (r: ResultRow) => comboLabel(r, t, platformLabel, connectivityLabel, localeLabel);

  // Per-row local drafts for failureReason / actualResult so the tester can
  // type without triggering a request on every keystroke. Saved on blur or
  // when the row's status changes away from FAILED.
  const [drafts, setDrafts] = useState<Record<string, { failureReason: string; actualResult: string }>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Rows the tester *wants* to mark FAILED but hasn't filled in yet. We open
  // the reason/details form locally instead of pushing a rejected save.
  const [stagedFail, setStagedFail] = useState<Set<string>>(new Set());

  function getDraft(r: ResultRow) {
    return drafts[r.id] ?? {
      failureReason: r.failureReason ?? "",
      actualResult: r.actualResult ?? "",
    };
  }

  function setDraft(id: string, patch: Partial<{ failureReason: string; actualResult: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...getDraftOrEmpty(prev, id), ...patch } }));
  }

  function getDraftOrEmpty(prev: typeof drafts, id: string) {
    const r = results.find((x) => x.id === id);
    return prev[id] ?? { failureReason: r?.failureReason ?? "", actualResult: r?.actualResult ?? "" };
  }

  const patchRow = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/execution-results/${id}`, body)).data,
    onSuccess: (_data, vars) => {
      logger.info("execution result updated", { resultId: vars.id });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["execution", executionId] });
      setRowErrors((prev) => ({ ...prev, [vars.id]: "" }));
    },
    onError: (e: any, vars) => {
      const code = e.response?.data?.error ?? "save_failed";
      logger.warn("execution result update failed", { resultId: vars.id, code });
      setRowErrors((prev) => ({ ...prev, [vars.id]: code }));
    },
  });

  const bulkPassed = useMutation({
    mutationFn: async () =>
      (await api.post("/execution-results/bulk", { executionId, status: "PASSED" })).data,
    onSuccess: () => {
      logger.info("execution results bulk-passed", { executionId });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["execution", executionId] });
      toast.success(t("runs.matrix.all_passed_saved"));
    },
  });

  const createBug = useMutation({
    mutationFn: async (resultId: string) =>
      (await api.post(`/jira/results/${resultId}/create-bug`)).data,
    onSuccess: (_data, resultId) => {
      logger.info("jira bug created for result", { resultId });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["execution", executionId] });
      toast.success(t("jira.bug_created"));
      setRowErrors((prev) => ({ ...prev, [resultId]: "" }));
    },
    onError: (e: any, resultId) => {
      const code = e.response?.data?.error ?? "create_failed";
      logger.warn("jira bug creation failed", { resultId, code });
      setRowErrors((prev) => ({ ...prev, [resultId]: code }));
    },
  });

  const confirmDialog = useConfirm();
  const unlinkBug = useMutation({
    mutationFn: async ({ resultId }: { resultId: string; key: string }) =>
      (await api.post(`/jira/results/${resultId}/unlink`)).data,
    onSuccess: (_data, vars) => {
      logger.info("jira issue unlinked from result", { resultId: vars.resultId, key: vars.key });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["execution", executionId] });
      toast.success(t("jira.unlinked_key", { key: vars.key }));
    },
  });

  async function onUnlinkRow(r: ResultRow) {
    if (!r.jiraIssueKey) return;
    const confirmed = await confirmDialog({
      title: t("jira.unlink_confirm", { key: r.jiraIssueKey }),
      body: t("jira.unlink_confirm_body"),
      tone: "warning",
    });
    if (confirmed) unlinkBug.mutate({ resultId: r.id, key: r.jiraIssueKey });
  }

  function onSetStatus(r: ResultRow, status: Status) {
    const draft = getDraft(r);
    if (status === "FAILED") {
      // Expand the row locally so the tester can fill reason + actual result
      // first. The row isn't marked FAILED on the server until both fields
      // have text — blurring the form saves it.
      if (!draft.failureReason.trim() || !draft.actualResult.trim()) {
        setStagedFail((prev) => {
          const next = new Set(prev);
          next.add(r.id);
          return next;
        });
        return;
      }
      patchRow.mutate({
        id: r.id,
        body: { status: "FAILED", failureReason: draft.failureReason, actualResult: draft.actualResult },
      });
      return;
    }
    // Any non-FAILED transition clears the staged-fail intent.
    if (stagedFail.has(r.id)) {
      setStagedFail((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
    patchRow.mutate({ id: r.id, body: { status } });
  }

  function onBlurDraft(r: ResultRow) {
    const draft = getDraft(r);
    const wantsFail = r.status === "FAILED" || stagedFail.has(r.id);
    if (!wantsFail) return;
    // Only persist once both fields have content; otherwise keep the row in
    // local "staging" until the tester finishes typing.
    if (!draft.failureReason.trim() || !draft.actualResult.trim()) return;
    if (
      r.status === "FAILED" &&
      draft.failureReason === (r.failureReason ?? "") &&
      draft.actualResult === (r.actualResult ?? "")
    ) {
      return;
    }
    patchRow.mutate({
      id: r.id,
      body: { status: "FAILED", failureReason: draft.failureReason, actualResult: draft.actualResult },
    });
    if (stagedFail.has(r.id)) {
      setStagedFail((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
  }

  const pending = agg.pending;
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = agg.failing.length;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="label">{t("runs.matrix.title")}</div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <Badge tone={execStatusTone(agg.status)}>
              {agg.status === "FAILED" && agg.failing.length > 0
                ? t("runs.matrix.failed_on", {
                    combos: agg.failing.map((r) => label(r)).join(", "),
                  })
                : agg.status === "PASSED"
                ? t("runs.matrix.all_passed", { count: results.length })
                : agg.status === "PENDING"
                ? t("runs.matrix.progress", { done: agg.done, total: results.length })
                : t(`status.${agg.status}`)}
            </Badge>
            <span className="text-xs text-slate-500">
              {t("runs.matrix.summary", { passed, failed, pending, total: results.length })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => bulkPassed.mutate()}
            disabled={bulkPassed.isPending || pending === 0}
            title={t("runs.matrix.mark_all_passed_hint")}
          >
            {bulkPassed.isPending ? <Spinner size={14} className="text-slate-600" /> : <CheckCircle2 size={14} />}
            {t("runs.matrix.mark_all_passed")}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
        {results.map((r) => {
          const draft = getDraft(r);
          const rowErr = rowErrors[r.id];
          const isFailed = r.status === "FAILED";
          const isStagedFail = stagedFail.has(r.id);
          const showFailForm = isFailed || isStagedFail;
          const isBeingPatched = patchRow.isPending && patchRow.variables?.id === r.id;
          const creatingBug = createBug.isPending && createBug.variables === r.id;
          return (
            <div key={r.id} className={`p-3 ${showFailForm ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge tone={execStatusTone(isStagedFail && !isFailed ? "FAILED" : r.status)} dot>
                    {t(`status.${isStagedFail && !isFailed ? "FAILED" : r.status}`)}
                  </Badge>
                  <span className="text-sm font-medium truncate">{label(r)}</span>
                  {r.jiraIssueKey && (
                    <a
                      href={r.jiraIssueUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-amber-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Bug size={10} /> {r.jiraIssueKey} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {STATUSES.map((s) => {
                    const active = r.status === s || (s === "FAILED" && isStagedFail && !isFailed);
                    return (
                      <button
                        key={s}
                        onClick={() => onSetStatus(r, s)}
                        disabled={isBeingPatched}
                        className={`px-2 py-1 text-xs rounded border transition ${
                          active
                            ? s === "PASSED"
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : s === "FAILED"
                              ? "bg-red-600 text-white border-red-600"
                              : s === "BLOCKED"
                              ? "bg-amber-600 text-white border-amber-600"
                              : "bg-slate-600 text-white border-slate-600"
                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {t(`status.${s}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showFailForm && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="label">{t("runs.actual_result")}</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={draft.actualResult}
                      onChange={(e) => setDraft(r.id, { actualResult: e.target.value })}
                      onBlur={() => onBlurDraft(r)}
                      placeholder={t("runs.actual_placeholder")}
                    />
                  </div>
                  <div>
                    <label className="label">{t("runs.why_failed")}</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={draft.failureReason}
                      onChange={(e) => setDraft(r.id, { failureReason: e.target.value })}
                      onBlur={() => onBlurDraft(r)}
                      placeholder={t("runs.why_failed_placeholder")}
                    />
                  </div>
                  {!r.jiraIssueKey ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="btn-primary"
                        disabled={!jiraReady || creatingBug || !draft.failureReason.trim() || !draft.actualResult.trim()}
                        onClick={() => createBug.mutate(r.id)}
                      >
                        {creatingBug ? <Spinner size={14} className="text-white" /> : <Bug size={14} />}
                        {t("jira.create_bug")}
                      </button>
                      {!jiraReady && (
                        <span className="text-xs text-slate-500">{t("jira.not_configured")}</span>
                      )}
                      {(!draft.failureReason.trim() || !draft.actualResult.trim()) && (
                        <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                          <LinkIcon size={10} /> {t("runs.matrix.needs_reason_details")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <button
                        className="btn-secondary text-red-600"
                        onClick={() => onUnlinkRow(r)}
                        disabled={unlinkBug.isPending && unlinkBug.variables?.resultId === r.id}
                      >
                        {t("jira.unlink")}
                      </button>
                    </div>
                  )}
                  {rowErr && (
                    <div className="text-xs text-red-600">
                      {rowErr === "RESULT_FAILED_REQUIRES_REASON_AND_DETAILS"
                        ? t("errors.RESULT_FAILED_REQUIRES_REASON_AND_DETAILS")
                        : t(`errors.${rowErr}`, { defaultValue: t("common.save_failed") })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

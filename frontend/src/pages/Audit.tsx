import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, FileSearch } from "lucide-react";
import { api } from "../lib/api";
import { logger } from "../lib/logger";

type Row = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown> | null;
  user: { id: string; name: string; email: string } | null;
  project: { id: string; key: string; name: string } | null;
};

function formatDetail(action: string, p: Record<string, unknown> | null, t: (k: string, opts?: Record<string, unknown>) => string): string | null {
  if (!p) return null;
  switch (action) {
    case "RUN_CREATED":
      return t("audit.detail_run_created", { name: p.name, count: p.caseCount });
    case "RUN_STATUS_CHANGED":
      // Older rows may only have `status` (no `from`/`to`).
      if (p.from && p.to)
        return t("audit.detail_status_changed", { name: p.name ?? "", from: p.from, to: p.to });
      return t("audit.detail_status_set", { status: p.status ?? p.to });
    case "EXECUTION_STATUS_CHANGED":
      return t("audit.detail_exec_status", { case: p.case, from: p.from, to: p.to });
    case "EXECUTION_ASSIGNED":
      return t("audit.detail_exec_assigned", { case: p.case });
    case "CASE_CREATED":
      return t("audit.detail_case_created", { title: p.title });
    case "CASE_UPDATED":
      return t("audit.detail_case_updated", { title: p.title });
    case "CASE_CLONED":
      return t("audit.detail_case_cloned", { title: p.title });
    case "COMMENT_ADDED": {
      const body = typeof p.body === "string" ? p.body : "";
      return body.length > 80 ? body.slice(0, 80) + "…" : body;
    }
    case "JIRA_LINKED":
      return t("audit.detail_jira_linked", { key: p.issueKey });
    case "SHARED_STEP_CREATED":
    case "SHARED_STEP_UPDATED":
      return t("audit.detail_shared_step", { name: p.name });
    case "WEBHOOK_CONFIGURED":
      return t("audit.detail_webhook", { url: p.url, count: Array.isArray(p.events) ? p.events.length : 0 });
    case "CUSTOM_FIELDS_UPDATED":
      return t("audit.detail_custom_fields", { count: p.count });
    default:
      return null;
  }
}

export function Audit() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ action: "", from: "", to: "", userId: "" });

  const params: Record<string, string> = {};
  if (filters.action) params.action = filters.action;
  if (filters.from) params.from = new Date(filters.from).toISOString();
  if (filters.to) params.to = new Date(filters.to + "T23:59:59").toISOString();
  if (filters.userId) params.userId = filters.userId;

  const { data: rows = [] } = useQuery<Row[]>({
    queryKey: ["audit", params],
    queryFn: async () => (await api.get("/audit", { params })).data,
  });

  const { data: users = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  function downloadCsv() {
    const qs = new URLSearchParams({ ...params, format: "csv" });
    const token = localStorage.getItem("ts_token");
    // Trigger a browser download via fetch with the auth header.
    fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/audit?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "audit.csv";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => { logger.error("audit CSV download failed", { err }); });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSearch size={22} className="text-brand-600" />
            {t("audit.title")}
          </h1>
          <p className="text-sm text-slate-500">{t("audit.subtitle")}</p>
        </div>
        <button className="btn-secondary" onClick={downloadCsv}>
          <Download size={14} /> {t("audit.download_csv")}
        </button>
      </header>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="label">{t("audit.action_filter")}</label>
          <input
            className="input"
            placeholder={t("audit.action_placeholder")}
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          />
        </div>
        <div>
          <label className="label">{t("audit.user_filter")}</label>
          <select
            className="input"
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
          >
            <option value="">{t("common.none")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("audit.from")}</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="label">{t("audit.to")}</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">{t("audit.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2 text-left">{t("audit.when")}</th>
                  <th className="px-4 py-2 text-left">{t("audit.user")}</th>
                  <th className="px-4 py-2 text-left">{t("audit.action")}</th>
                  <th className="px-4 py-2 text-left">{t("audit.details")}</th>
                  <th className="px-4 py-2 text-left">{t("audit.project")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  const detail = formatDetail(r.action, r.payload, t);
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2">{r.user?.name ?? "—"}<div className="text-xs text-slate-500">{r.user?.email ?? ""}</div></td>
                      <td className="px-4 py-2"><span className="badge bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">{r.action}</span></td>
                      <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 max-w-[36ch] truncate" title={detail ?? ""}>{detail ?? "—"}</td>
                      <td className="px-4 py-2">{r.project ? `${r.project.key} · ${r.project.name}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800">
          {t("audit.rows_count", { count: rows.length })}
        </div>
      </div>
    </div>
  );
}

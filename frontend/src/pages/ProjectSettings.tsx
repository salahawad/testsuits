import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { CustomFieldsEditor } from "../components/CustomFieldsEditor";
import { WebhooksEditor } from "../components/WebhooksEditor";
import { SharedStepsEditor } from "../components/SharedStepsEditor";
import { InlineLoader } from "../components/Spinner";

type ProjectBinding = {
  id: string;
  name: string;
  key: string;
  jiraProjectKey: string | null;
  jiraProjectName: string | null;
  jiraIssueType: string | null;
  jiraParentEpicKey: string | null;
  jiraParentEpicSummary: string | null;
};

type CompanyJiraConfig = {
  baseUrl: string;
  email: string;
  defaultIssueType: string;
  enabled: boolean;
  hasToken: boolean;
};

export function ProjectSettings() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  if (!isManager) return <Navigate to={`/projects/${id}`} replace />;

  const [tab, setTab] = useState<"jira" | "custom_fields" | "shared_steps" | "webhooks">("jira");
  const [form, setForm] = useState({
    jiraProjectKey: "",
    jiraProjectName: "",
    jiraIssueType: "",
    jiraParentEpicKey: "",
    jiraParentEpicSummary: "",
  });
  const [projectQuery, setProjectQuery] = useState("");
  const [epicQuery, setEpicQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const { data: binding } = useQuery<ProjectBinding | null>({
    queryKey: ["jira-binding", id],
    queryFn: async () => (await api.get(`/jira/projects/${id}/binding`)).data,
    enabled: !!id,
  });

  const { data: companyConfig } = useQuery<CompanyJiraConfig | null>({
    queryKey: ["jira-config"],
    queryFn: async () => (await api.get(`/jira/config`)).data,
  });

  const canDiscover = !!companyConfig?.hasToken && companyConfig.enabled;

  const { data: jiraProjects = [], refetch: refetchProjects, isFetching: loadingProjects } = useQuery({
    queryKey: ["jira-projects", projectQuery],
    queryFn: async () => (await api.get(`/jira/discover/projects`, { params: projectQuery ? { q: projectQuery } : {} })).data,
    enabled: canDiscover,
  });

  const { data: issueTypes = [], refetch: refetchIssueTypes } = useQuery({
    queryKey: ["jira-issue-types", form.jiraProjectKey],
    queryFn: async () => (await api.get(`/jira/discover/issue-types`, { params: { projectKey: form.jiraProjectKey } })).data,
    enabled: canDiscover && !!form.jiraProjectKey,
  });

  const { data: epics = [], refetch: refetchEpics, isFetching: loadingEpics } = useQuery({
    queryKey: ["jira-epics", form.jiraProjectKey, epicQuery],
    queryFn: async () =>
      (await api.get(`/jira/discover/epics`, {
        params: { projectKey: form.jiraProjectKey, ...(epicQuery ? { q: epicQuery } : {}) },
      })).data,
    enabled: canDiscover && !!form.jiraProjectKey,
  });

  useEffect(() => {
    if (binding) {
      setForm({
        jiraProjectKey: binding.jiraProjectKey ?? "",
        jiraProjectName: binding.jiraProjectName ?? "",
        jiraIssueType: binding.jiraIssueType ?? "",
        jiraParentEpicKey: binding.jiraParentEpicKey ?? "",
        jiraParentEpicSummary: binding.jiraParentEpicSummary ?? "",
      });
    }
  }, [binding?.jiraProjectKey, binding?.jiraParentEpicKey, binding?.jiraIssueType]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.put(`/jira/projects/${id}/binding`, {
        jiraProjectKey: form.jiraProjectKey || null,
        jiraProjectName: form.jiraProjectName || null,
        jiraIssueType: form.jiraIssueType || null,
        jiraParentEpicKey: form.jiraParentEpicKey || null,
        jiraParentEpicSummary: form.jiraParentEpicSummary || null,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jira-binding", id] });
      setErr(null);
      logger.info("project jira binding saved", { projectId: id, key: form.jiraProjectKey, epic: form.jiraParentEpicKey });
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Save failed"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  function pickJiraProject(p: { key: string; name: string }) {
    setForm((f) => ({
      ...f,
      jiraProjectKey: p.key,
      jiraProjectName: p.name,
      jiraParentEpicKey: "",
      jiraParentEpicSummary: "",
    }));
    setTimeout(() => refetchIssueTypes(), 0);
  }

  function pickEpic(e: { key: string; summary: string } | null) {
    setForm((f) => ({
      ...f,
      jiraParentEpicKey: e?.key ?? "",
      jiraParentEpicSummary: e?.summary ?? "",
    }));
  }

  function clearBinding() {
    setForm({
      jiraProjectKey: "",
      jiraProjectName: "",
      jiraIssueType: "",
      jiraParentEpicKey: "",
      jiraParentEpicSummary: "",
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {binding && (
        <Link to={`/projects/${binding.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-600">
          <ArrowLeft size={16} /> {binding.name}
        </Link>
      )}
      <header>
        <h1 className="text-2xl font-bold">{t("project.settings_title")}</h1>
        <p className="text-sm text-slate-500">{t("project.settings_subtitle")}</p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700 text-sm">
        {(["jira", "custom_fields", "shared_steps", "webhooks"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 border-b-2 -mb-px ${tab === key ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t(`project.tab_${key}`)}
          </button>
        ))}
      </nav>

      {tab === "custom_fields" && id && <CustomFieldsEditor projectId={id} canEdit={isManager} />}
      {tab === "shared_steps" && id && <SharedStepsEditor projectId={id} canEdit={isManager} />}
      {tab === "webhooks" && id && <WebhooksEditor projectId={id} canEdit={isManager} />}

      {tab === "jira" && !companyConfig?.hasToken && (
        <div className="card p-5 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100 text-sm">
          {t("jira.need_company_config")}{" "}
          <Link to="/company" className="text-brand-600 hover:underline">{t("company.settings_title")}</Link>
        </div>
      )}

      {tab === "jira" && (
      <form noValidate onSubmit={onSubmit} className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("jira.target_project")}</h2>
          {form.jiraProjectKey && isManager && (
            <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={clearBinding}>
              {t("jira.clear_binding")}
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded p-3">
          {t("jira.project_binding_hint")}
        </p>

        {canDiscover ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{t("jira.jira_project")}</h3>
              <button type="button" className="btn-secondary text-xs" onClick={() => refetchProjects()}>
                <RefreshCw size={12} /> {t("jira.refresh")}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  className="input mb-2"
                  placeholder={t("common.search")}
                  value={projectQuery}
                  onChange={(e) => setProjectQuery(e.target.value)}
                />
                <div className="border border-slate-200 dark:border-slate-700 rounded max-h-56 overflow-auto">
                  {loadingProjects && <InlineLoader />}
                  {jiraProjects.map((p: any) => (
                    <button
                      type="button"
                      key={p.key}
                      onClick={() => pickJiraProject(p)}
                      disabled={!isManager}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 ${form.jiraProjectKey === p.key ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.key}</div>
                    </button>
                  ))}
                  {!loadingProjects && jiraProjects.length === 0 && <div className="p-2 text-xs text-slate-500">—</div>}
                </div>
              </div>
              <div>
                <label className="label">{t("jira.issue_type")}</label>
                <select
                  className="input"
                  value={form.jiraIssueType}
                  onChange={(e) => setForm({ ...form, jiraIssueType: e.target.value })}
                  disabled={!form.jiraProjectKey || !isManager}
                >
                  <option value="">{t("jira.use_company_default", { type: companyConfig?.defaultIssueType ?? "Bug" })}</option>
                  {issueTypes.map((name: string) => <option key={name} value={name}>{name}</option>)}
                </select>
                {form.jiraProjectKey && (
                  <div className="text-xs text-slate-500 mt-2">
                    {t("jira.using_project", { key: form.jiraProjectKey, name: form.jiraProjectName || "" })}
                  </div>
                )}
              </div>
            </div>

            {form.jiraProjectKey && (
              <section className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">{t("jira.parent_epic")}</h3>
                  <button type="button" className="btn-secondary text-xs" onClick={() => refetchEpics()}>
                    <RefreshCw size={12} /> {t("jira.refresh")}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{t("jira.parent_epic_help")}</p>
                {form.jiraParentEpicKey && (
                  <div className="flex items-center gap-2 text-sm bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-100 rounded px-3 py-2">
                    <span className="badge bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">{form.jiraParentEpicKey}</span>
                    <span className="flex-1">{form.jiraParentEpicSummary}</span>
                    <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => pickEpic(null)}>
                      <X size={14} />
                    </button>
                  </div>
                )}
                <input className="input" placeholder={t("jira.epic_search_placeholder")} value={epicQuery} onChange={(e) => setEpicQuery(e.target.value)} />
                <div className="border border-slate-200 dark:border-slate-700 rounded max-h-48 overflow-auto">
                  {loadingEpics && <InlineLoader />}
                  {epics.map((ep: any) => (
                    <button
                      type="button"
                      key={ep.key}
                      onClick={() => pickEpic(ep)}
                      disabled={!isManager}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 ${form.jiraParentEpicKey === ep.key ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="badge bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300 text-xs">{ep.key}</span>
                        {ep.status && <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200 text-xs">{ep.status}</span>}
                      </div>
                      <div className="text-sm mt-0.5">{ep.summary}</div>
                    </button>
                  ))}
                  {!loadingEpics && epics.length === 0 && <div className="p-2 text-xs text-slate-500">{t("jira.no_epics")}</div>}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500">{t("jira.cannot_discover")}</div>
        )}

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex gap-2 justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          {isManager && <button type="submit" className="btn-primary" disabled={save.isPending}>{t("common.save")}</button>}
        </div>
      </form>
      )}
    </div>
  );
}

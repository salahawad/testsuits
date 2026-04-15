import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { runStatusColors } from "../lib/status";
import { CONNECTIVITY, PLATFORMS, TEST_LEVELS } from "../lib/enums";
import { logger } from "../lib/logger";

export function Runs() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const projectIdFilter = params.get("projectId") ?? "";
  const milestoneIdFilter = params.get("milestoneId") ?? "";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("");
  const [platform, setPlatform] = useState("");
  const [connectivity, setConnectivity] = useState("");
  const [locale, setLocale] = useState("");
  const [testLevels, setTestLevels] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState(projectIdFilter);
  const [milestoneId, setMilestoneId] = useState("");
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState("");

  const runsParams: Record<string, string> = {};
  if (projectIdFilter) runsParams.projectId = projectIdFilter;
  if (milestoneIdFilter) runsParams.milestoneId = milestoneIdFilter;

  const { data: runs = [] } = useQuery({
    queryKey: ["runs", runsParams],
    queryFn: async () => (await api.get("/runs", { params: runsParams })).data,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects")).data,
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", projectId],
    queryFn: async () => (await api.get("/milestones", { params: { projectId } })).data,
    enabled: !!projectId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/runs", {
        projectId,
        milestoneId: milestoneId || null,
        name,
        description,
        environment: environment || null,
        platform: platform || null,
        connectivity: connectivity || null,
        locale: locale || null,
        testLevels: testLevels.length ? testLevels : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        suiteIds: selectedSuiteIds,
        assigneeId: assigneeId || null,
      })).data,
    onSuccess: (run) => {
      logger.info("run created", { runId: run.id, platform, connectivity, locale, levels: testLevels });
      qc.invalidateQueries({ queryKey: ["runs"] });
      setOpen(false);
      setName("");
      setDescription("");
      setEnvironment("");
      setPlatform("");
      setConnectivity("");
      setLocale("");
      setTestLevels([]);
      setDueDate("");
      setSelectedSuiteIds([]);
      setMilestoneId("");
      setAssigneeId("");
    },
    onError: (e: any) => logger.error("run create failed", { status: e?.response?.status }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  function toggleSuite(sid: string) {
    setSelectedSuiteIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("runs.title")}</h1>
          <p className="text-sm text-slate-500">{t("runs.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("runs.new_run")}</button>
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("runs.project")}</label>
              <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setSelectedSuiteIds([]); setMilestoneId(""); }} required>
                <option value="">{t("runs.select_project")}</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t("runs.run_name")}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t("runs.milestone")}</label>
              <select className="input" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} disabled={!projectId}>
                <option value="">—</option>
                {milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t("runs.environment")}</label>
              <input className="input" placeholder="Chrome 120 / Prod" value={environment} onChange={(e) => setEnvironment(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("runs.due_date")}</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t("platform.label")}</label>
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="">{t("platform.any")}</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{t(`platform.${p}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t("connectivity.label")}</label>
              <select className="input" value={connectivity} onChange={(e) => setConnectivity(e.target.value)}>
                <option value="">{t("connectivity.any")}</option>
                {CONNECTIVITY.map((c) => <option key={c} value={c}>{t(`connectivity.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t("locale.label")}</label>
              <input className="input" placeholder={t("locale.placeholder")} value={locale} onChange={(e) => setLocale(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{t("test_level.filter_by")}</label>
            <div className="flex gap-2 flex-wrap">
              {TEST_LEVELS.map((lvl) => (
                <label key={lvl} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={testLevels.includes(lvl)}
                    onChange={() => setTestLevels((xs) => xs.includes(lvl) ? xs.filter((x) => x !== lvl) : [...xs, lvl])}
                  />
                  {t(`test_level.${lvl}`)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t("runs.default_assignee")}</label>
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">{t("common.unassigned")}</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t("common.description")}</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {project && (
            <div>
              <label className="label">{t("runs.include_suites")}</label>
              <div className="space-y-1 max-h-48 overflow-auto border border-slate-200 rounded p-2">
                {project.suites.map((s: any) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedSuiteIds.includes(s.id)} onChange={() => toggleSuite(s.id)} />
                    {s.name} <span className="text-xs text-slate-500">({t("projects.suites_count", { count: s._count.cases })})</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending || !projectId || selectedSuiteIds.length === 0}>{t("common.create")}</button>
          </div>
        </form>
      )}

      {runs.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t("runs.empty")}</div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {runs.map((r: any) => (
            <Link key={r.id} to={`/runs/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>{r.project.name}</span>
                  {r.milestone && <span className="badge bg-violet-100 text-violet-700">{r.milestone.name}</span>}
                  {r.platform && <span className="badge bg-sky-100 text-sky-800">{t(`platform.${r.platform}`)}</span>}
                  {r.connectivity && <span className="badge bg-emerald-100 text-emerald-800">{t(`connectivity.${r.connectivity}`)}</span>}
                  {r.locale && <span className="badge bg-rose-100 text-rose-800">{r.locale}</span>}
                  {r.environment && <span className="badge bg-slate-100 text-slate-700">{r.environment}</span>}
                  <span>{r._count.executions} cases</span>
                  <span>by {r.createdBy.name}</span>
                  {r.dueDate && <span>due {new Date(r.dueDate).toLocaleDateString()}</span>}
                </div>
              </div>
              <span className={`badge ${runStatusColors[r.status]}`}>{r.status.replace("_", " ")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

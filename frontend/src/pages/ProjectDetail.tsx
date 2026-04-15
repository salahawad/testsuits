import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { FolderTree, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

export function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data,
    enabled: !!id,
  });

  const createSuite = useMutation({
    mutationFn: async () => (await api.post("/suites", { projectId: id, name, description })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      setOpen(false);
      setName("");
      setDescription("");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createSuite.mutate();
  }

  if (isLoading) return <div className="text-slate-500">{t("common.loading")}</div>;
  if (!project) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-brand-600 mb-1">{project.key}</div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-sm text-slate-500 mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link to={`/projects/${project.id}/milestones`} className="btn-secondary">{t("projects.milestones")}</Link>
          <Link to={`/projects/${project.id}/requirements`} className="btn-secondary">{t("requirements.title")}</Link>
          <Link to={`/projects/${project.id}/settings`} className="btn-secondary">{t("projects.settings")}</Link>
          <Link to={`/runs?projectId=${project.id}`} className="btn-secondary">{t("projects.test_runs")}</Link>
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("projects.new_suite")}</button>
        </div>
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div>
            <label className="label">{t("projects.suite_name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("common.description")}</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={createSuite.isPending}>{t("common.create")}</button>
          </div>
        </form>
      )}

      <div>
        <h2 className="font-semibold mb-3">{t("projects.test_suites")}</h2>
        {project.suites.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">{t("projects.no_suites")}</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {project.suites.map((s: any) => (
              <Link key={s.id} to={`/suites/${s.id}`} className="card p-4 hover:border-brand-500 flex items-center gap-3">
                <FolderTree size={20} className="text-brand-600" />
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {t("projects.suites_count", { count: s._count.cases })}
                    {s.children.length > 0 && ` · ${s.children.length} ${t("suites.sub_suites").toLowerCase()}`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

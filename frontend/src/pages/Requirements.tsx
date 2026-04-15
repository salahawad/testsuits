import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Trash2, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Requirement = {
  id: string;
  projectId: string;
  externalRef: string;
  title: string;
  description: string | null;
  createdAt: string;
  _count?: { cases: number };
};

export function Requirements() {
  const { id: projectId } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isManager = user?.role === "MANAGER";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ externalRef: "", title: "", description: "" });
  const [err, setErr] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
  });

  const { data: reqs = [], isLoading } = useQuery<Requirement[]>({
    queryKey: ["requirements", projectId],
    queryFn: async () => (await api.get(`/requirements`, { params: { projectId } })).data,
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post(`/requirements`, { projectId, ...form, description: form.description || null })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirements", projectId] });
      setOpen(false);
      setForm({ externalRef: "", title: "", description: "" });
      setErr(null);
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Create failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/requirements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requirements", projectId] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const isUrl = (ref: string) => /^https?:\/\//.test(ref);

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500">
        <Link to={`/projects/${projectId}`} className="hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={12} /> {project?.name ?? t("common.loading")}
        </Link>
      </div>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("requirements.title")}</h1>
          <p className="text-sm text-slate-500">{t("requirements.subtitle")}</p>
        </div>
        {isManager && (
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> {t("requirements.new")}
          </button>
        )}
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div>
            <label className="label">{t("requirements.external_ref")}</label>
            <input
              className="input"
              value={form.externalRef}
              onChange={(e) => setForm({ ...form, externalRef: e.target.value })}
              placeholder="ACME-1201 or https://jira.example.com/browse/ACME-1201"
              required
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">{t("requirements.external_ref_help")}</p>
          </div>
          <div>
            <label className="label">{t("requirements.req_title")}</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">{t("requirements.description")}</label>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {t("common.create")}
            </button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-slate-100">
        {isLoading ? (
          <div className="px-5 py-4 text-sm text-slate-500">{t("common.loading")}</div>
        ) : reqs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">{t("requirements.empty")}</div>
        ) : (
          reqs.map((r) => (
            <div key={r.id} className="flex items-start justify-between px-5 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge bg-brand-50 text-brand-700 font-mono">
                    {isUrl(r.externalRef) ? (
                      <a href={r.externalRef} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                        {r.externalRef} <ExternalLink size={11} />
                      </a>
                    ) : (
                      r.externalRef
                    )}
                  </span>
                  <span className="font-medium">{r.title}</span>
                  <span className="badge bg-slate-100 text-slate-700">
                    {t("requirements.linked_cases")}: {r._count?.cases ?? 0}
                  </span>
                </div>
                {r.description && <div className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{r.description}</div>}
              </div>
              {isManager && (
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => { if (confirm(t("common.delete") + "?")) remove.mutate(r.id); }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

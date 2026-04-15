import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

export function Projects() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects")).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/projects", { key: key.toUpperCase(), name, description })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setKey("");
      setName("");
      setDescription("");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("projects.title")}</h1>
          <p className="text-sm text-slate-500">{t("projects.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("projects.new_project")}</button>
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t("projects.key")}</label>
              <input className="input" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="AUTH" required maxLength={16} />
            </div>
            <div className="col-span-2">
              <label className="label">{t("common.name")}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">{t("common.description")}</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{t("common.create")}</button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t("projects.empty")}</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card p-5 hover:border-brand-500 transition">
              <div className="flex items-center justify-between mb-2">
                <span className="badge bg-brand-50 text-brand-700">{p.key}</span>
                <span className="text-xs text-slate-500">
                  {t("projects.suites_count", { count: p._count.suites })} · {t("projects.runs_count", { count: p._count.runs })}
                </span>
              </div>
              <div className="font-semibold">{p.name}</div>
              {p.description && <div className="text-sm text-slate-500 mt-1 line-clamp-2">{p.description}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

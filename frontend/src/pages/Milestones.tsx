import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

const statusColors: Record<string, string> = {
  PLANNED: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-blue-100 text-blue-800",
  RELEASED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-500",
};

export function Milestones() {
  const { t } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("PLANNED");

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data,
    enabled: !!id,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", id],
    queryFn: async () => (await api.get("/milestones", { params: { projectId: id } })).data,
    enabled: !!id,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/milestones", {
        projectId: id,
        name,
        description,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones", id] });
      setOpen(false);
      setName("");
      setDescription("");
      setDueDate("");
      setStatus("PLANNED");
    },
  });

  const remove = useMutation({
    mutationFn: async (mid: string) => api.delete(`/milestones/${mid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["milestones", id] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ mid, status }: { mid: string; status: string }) =>
      (await api.patch(`/milestones/${mid}`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["milestones", id] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      {project && (
        <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-600">
          <ArrowLeft size={16} /> {project.name}
        </Link>
      )}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("milestones.title")}</h1>
          <p className="text-sm text-slate-500">{t("milestones.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("milestones.new_milestone")}</button>
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div>
            <label className="label">{t("common.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("common.description")}</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("runs.due_date")}</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("common.status")}</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{t("common.create")}</button>
          </div>
        </form>
      )}

      {milestones.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t("milestones.empty")}</div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {milestones.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex-1">
                <Link to={`/runs?projectId=${id}&milestoneId=${m.id}`} className="font-medium hover:underline">{m.name}</Link>
                <div className="text-xs text-slate-500">
                  {t("milestones.runs_count", { count: m._count.runs })}
                  {m.dueDate && ` · ${t("milestones.due_on", { date: new Date(m.dueDate).toLocaleDateString() })}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className={`badge ${statusColors[m.status]} cursor-pointer`}
                  value={m.status}
                  onChange={(e) => updateStatus.mutate({ mid: m.id, status: e.target.value })}
                >
                  {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="text-slate-400 hover:text-red-600" onClick={() => { if (confirm(t("milestones.delete_confirm"))) remove.mutate(m.id); }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

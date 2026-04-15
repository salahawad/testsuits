import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { logger } from "../lib/logger";

export function Team() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "TESTER" as "MANAGER" | "TESTER" });
  const [err, setErr] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/users", form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
      setForm({ email: "", name: "", password: "", role: "TESTER" });
      setErr(null);
      logger.info("team member added via UI");
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) =>
      (await api.patch(`/users/${id}`, { role })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const isManager = user?.role === "MANAGER";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("team.title")}</h1>
          <p className="text-sm text-slate-500">
            {t("team.subtitle", { company: user?.company.name })}
          </p>
        </div>
        {isManager && (
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> {t("team.add_member")}
          </button>
        )}
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("auth.name")}</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">{t("auth.email")}</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("auth.password")}</label>
              <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </div>
            <div>
              <label className="label">{t("team.role")}</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
                <option value="TESTER">{t("team.tester")}</option>
                <option value="MANAGER">{t("team.manager")}</option>
              </select>
            </div>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{t("common.create")}</button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-slate-100">
        {users.map((u: any) => (
          <div key={u.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {isManager && u.id !== user?.id ? (
                <select
                  className="input text-xs py-1"
                  value={u.role}
                  onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                >
                  <option value="TESTER">{t("team.tester")}</option>
                  <option value="MANAGER">{t("team.manager")}</option>
                </select>
              ) : (
                <span className={`badge ${u.role === "MANAGER" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>
                  {t(`team.${u.role.toLowerCase()}`)}
                </span>
              )}
              {isManager && u.id !== user?.id && (
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => { if (confirm(t("team.delete_confirm"))) remove.mutate(u.id); }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

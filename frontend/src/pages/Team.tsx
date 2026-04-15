import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { logger } from "../lib/logger";

type InviteResult = {
  id: string;
  email: string;
  name: string;
  role: "MANAGER" | "TESTER";
  devToken?: string;
};

export function Team() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "TESTER" as "MANAGER" | "TESTER" });
  const [err, setErr] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const invite = useMutation({
    mutationFn: async () => (await api.post("/auth/invite", form)).data as InviteResult,
    onSuccess: (data) => {
      setLastInvite(data);
      setOpen(false);
      setForm({ email: "", name: "", role: "TESTER" });
      setErr(null);
      logger.info("teammate invite created");
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Invite failed"),
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
    invite.mutate();
  }

  function inviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  function copyInvite() {
    if (!lastInvite?.devToken) return;
    navigator.clipboard.writeText(inviteUrl(lastInvite.devToken)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          <button className="btn-primary" onClick={() => { setOpen(true); setLastInvite(null); }}>
            <Plus size={16} /> {t("team.invite_member")}
          </button>
        )}
      </header>

      {open && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <p className="text-sm text-slate-500">{t("team.invite_subtitle")}</p>
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
          <div>
            <label className="label">{t("team.role")}</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
              <option value="TESTER">{t("team.tester")}</option>
              <option value="MANAGER">{t("team.manager")}</option>
            </select>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={invite.isPending}>
              {invite.isPending ? t("common.please_wait") : t("team.invite_member")}
            </button>
          </div>
        </form>
      )}

      {lastInvite?.devToken && import.meta.env.DEV && (
        <div className="card p-5 space-y-3 border-l-4 border-amber-400">
          <div>
            <h2 className="font-semibold text-amber-800">{t("team.invite_sent")}</h2>
            <p className="text-sm text-slate-600 mt-1">
              {lastInvite.name} &lt;{lastInvite.email}&gt; · {t(`team.${lastInvite.role.toLowerCase()}`)}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-slate-900 text-slate-100 px-3 py-2 font-mono text-xs">
            <span className="flex-1 break-all">{inviteUrl(lastInvite.devToken)}</span>
            <button type="button" className="text-slate-300 hover:text-white flex items-center gap-1" onClick={copyInvite}>
              <Copy size={14} /> {copied ? t("tokens.copied") : t("tokens.copy")}
            </button>
          </div>
          <div className="flex justify-end">
            <button className="btn-secondary" onClick={() => setLastInvite(null)}>{t("common.close")}</button>
          </div>
        </div>
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

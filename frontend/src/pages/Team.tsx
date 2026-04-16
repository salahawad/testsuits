import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Lock, Plus, Trash2, Unlock } from "lucide-react";
import { UserAvatar } from "../components/UserAvatar";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { Field } from "../components/Field";
import { useZodForm } from "../lib/useZodForm";
import { emailFieldWithMessages, roleEnum } from "../lib/schemas";
import { apiErrorMessage } from "../lib/apiError";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { useConfirm } from "../components/ui/ConfirmDialog";

type InviteResult = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "TESTER" | "VIEWER";
  devToken?: string;
};

type InviteValues = { name: string; email: string; role: "ADMIN" | "MANAGER" | "TESTER" | "VIEWER" };

export function Team() {
  const { t } = useTranslation();

  const inviteSchema = useMemo(() => z.object({
    name: z.string().min(1, t("validation.name_required")),
    email: emailFieldWithMessages(t),
    role: roleEnum,
  }), [t]);
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useZodForm<InviteValues>(inviteSchema, {
    defaultValues: { email: "", name: "", role: "TESTER" },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const invite = useMutation({
    mutationFn: async (values: InviteValues) =>
      (await api.post("/auth/invite", values, { silent: true })).data as InviteResult,
    onSuccess: (data) => {
      setLastInvite(data);
      setOpen(false);
      form.reset({ email: "", name: "", role: "TESTER" });
      setSubmitError(null);
      toast.success(t("team.invite_sent"));
      logger.info("teammate invite created");
    },
    onError: (e: unknown) => {
      logger.warn("invite failed");
      setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("team.member_removed"));
      logger.info("team member removed");
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) =>
      (await api.patch(`/users/${id}`, { role })).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("team.role_updated"));
      logger.info("team member role changed");
    },
  });

  const toggleLock = useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) =>
      (await api.patch(`/users/${id}/lock`, { locked })).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(vars.locked ? t("team.user_locked") : t("team.user_unlocked"));
      logger.info(vars.locked ? "user locked" : "user unlocked");
    },
  });

  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  function closeForm() {
    setOpen(false);
    form.reset({ email: "", name: "", role: "TESTER" });
    setSubmitError(null);
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
      <PageHeader
        title={t("team.title")}
        subtitle={t("team.subtitle", { company: user?.company.name })}
        actions={
          isManager && (
            <Button
              variant="primary"
              leftIcon={<Plus size={16} />}
              onClick={() => { setOpen(true); setLastInvite(null); setSubmitError(null); }}
            >
              {t("team.invite_member")}
            </Button>
          )
        }
      />

      {open && (
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => invite.mutate(values))}
          className="card p-5 space-y-3"
        >
          <p className="text-sm text-slate-500">{t("team.invite_subtitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field name="name" label={t("auth.name")} error={form.formState.errors.name?.message}>
              <input className="input" autoComplete="name" {...form.register("name")} />
            </Field>
            <Field name="email" label={t("auth.email")} error={form.formState.errors.email?.message}>
              <input type="email" className="input" autoComplete="email" {...form.register("email")} />
            </Field>
          </div>
          <Field name="role" label={t("team.role")} error={form.formState.errors.role?.message}>
            <select className="input" {...form.register("role")}>
              <option value="TESTER">{t("team.tester")}</option>
              <option value="MANAGER">{t("team.manager")}</option>
            </select>
          </Field>
          {submitError && <Alert>{submitError}</Alert>}
          <div className="flex gap-2 justify-end">
            <Button type="button" onClick={closeForm}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" loading={invite.isPending}>
              {t("team.invite_member")}
            </Button>
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
            <Button onClick={() => setLastInvite(null)}>{t("common.close")}</Button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {users.map((u: { id: string; name: string; email: string; role: string; isLocked?: boolean; lastLoginAt?: string | null; avatarKey?: string | null }) => (
          <div key={u.id} className={`flex items-center justify-between px-5 py-3${u.isLocked ? " opacity-60" : ""}`}>
            <div className="flex items-center gap-3">
              <UserAvatar userId={u.id} name={u.name} hasAvatar={!!u.avatarKey} size="w-9 h-9 text-sm" />
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  {u.name}
                  {u.isLocked && <Badge tone="danger">{t("team.locked")}</Badge>}
                </div>
                <div className="text-xs text-slate-500">{u.email}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {u.lastLoginAt
                    ? `${t("team.last_login")}: ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(u.lastLoginAt))}`
                    : t("team.never_logged_in")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isManager && u.id !== user?.id ? (
                <select
                  className="input text-xs py-1"
                  value={u.role}
                  disabled={changeRole.isPending && changeRole.variables?.id === u.id}
                  onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                >
                  <option value="TESTER">{t("team.tester")}</option>
                  <option value="MANAGER">{t("team.manager")}</option>
                </select>
              ) : (
                <Badge tone={u.role === "MANAGER" ? "violet" : "neutral"}>
                  {t(`team.${u.role.toLowerCase()}`)}
                </Badge>
              )}
              {isManager && u.id !== user?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={u.isLocked ? t("team.unlock") : t("team.lock")}
                  className={u.isLocked ? "text-amber-500 hover:text-green-600" : "text-slate-400 hover:text-amber-600"}
                  loading={toggleLock.isPending && toggleLock.variables?.id === u.id}
                  onClick={async () => {
                    const action = u.isLocked
                      ? { title: t("team.unlock_confirm"), confirmLabel: t("team.unlock"), tone: "neutral" as const }
                      : { title: t("team.lock_confirm"), confirmLabel: t("team.lock"), tone: "danger" as const };
                    if (await confirm(action)) toggleLock.mutate({ id: u.id, locked: !u.isLocked });
                  }}
                >
                  {!(toggleLock.isPending && toggleLock.variables?.id === u.id) && (u.isLocked ? <Unlock size={14} /> : <Lock size={14} />)}
                </Button>
              )}
              {isManager && u.id !== user?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("common.delete")}
                  className="text-slate-400 hover:text-red-600"
                  loading={remove.isPending && remove.variables === u.id}
                  onClick={async () => {
                    if (await confirm({
                      title: t("team.delete_confirm"),
                      confirmLabel: t("common.delete"),
                      tone: "danger",
                    })) remove.mutate(u.id);
                  }}
                >
                  {!(remove.isPending && remove.variables === u.id) && <Trash2 size={14} />}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

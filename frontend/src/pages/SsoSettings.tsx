import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type SamlConfig = {
  entityId: string;
  ssoUrl: string;
  emailAttribute: string;
  nameAttribute: string;
  defaultRole: "ADMIN" | "MANAGER" | "TESTER" | "VIEWER";
  enabled: boolean;
  updatedAt?: string;
} | null;

type ScimTokenRow = { id: string; name: string; lastUsedAt: string | null; createdAt: string };

export function SsoSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "ADMIN";

  const [form, setForm] = useState({
    entityId: "",
    ssoUrl: "",
    x509Cert: "",
    emailAttribute: "email",
    nameAttribute: "name",
    defaultRole: "TESTER" as SamlConfig extends null ? never : "ADMIN" | "MANAGER" | "TESTER" | "VIEWER",
    enabled: false,
  });
  const [err, setErr] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: cfg } = useQuery<SamlConfig>({
    queryKey: ["saml-config"],
    queryFn: async () => (await api.get("/saml/config")).data,
    enabled: isAdmin,
  });

  useEffect(() => {
    if (cfg) {
      setForm((f) => ({
        ...f,
        entityId: cfg.entityId ?? "",
        ssoUrl: cfg.ssoUrl ?? "",
        emailAttribute: cfg.emailAttribute ?? "email",
        nameAttribute: cfg.nameAttribute ?? "name",
        defaultRole: cfg.defaultRole ?? "TESTER",
        enabled: cfg.enabled ?? false,
      }));
    }
  }, [cfg?.entityId, cfg?.ssoUrl, cfg?.enabled]);

  const save = useMutation({
    mutationFn: async () => (await api.put("/saml/config", form)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saml-config"] }); setErr(null); },
    onError: (e: any) => setErr(e.response?.data?.error ?? t("common.something_went_wrong")),
  });

  const { data: tokens = [] } = useQuery<ScimTokenRow[]>({
    queryKey: ["scim-tokens"],
    queryFn: async () => (await api.get("/scim-tokens")).data,
    enabled: isAdmin,
  });

  const createToken = useMutation({
    mutationFn: async () => (await api.post("/scim-tokens", { name: tokenName })).data,
    onSuccess: (row: any) => {
      setNewToken(row.token);
      setTokenName("");
      qc.invalidateQueries({ queryKey: ["scim-tokens"] });
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (id: string) => api.delete(`/scim-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scim-tokens"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  function copyToken() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!isAdmin) {
    return <div className="text-sm text-slate-500">{t("sso.admin_only")}</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck size={22} className="text-brand-600" />
          {t("sso.title")}
        </h1>
        <p className="text-sm text-slate-500">{t("sso.subtitle")}</p>
      </header>

      <form noValidate onSubmit={onSubmit} className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("sso.saml_config")}</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            {t("sso.enabled")}
          </label>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded p-3">
          {t("sso.config_hint")}
        </p>

        <div>
          <label className="label">{t("sso.entity_id")}</label>
          <input className="input" placeholder="urn:testsuits:hapster" value={form.entityId}
            onChange={(e) => setForm({ ...form, entityId: e.target.value })} required />
        </div>
        <div>
          <label className="label">{t("sso.sso_url")}</label>
          <input type="url" className="input" placeholder="https://idp.example.com/sso" value={form.ssoUrl}
            onChange={(e) => setForm({ ...form, ssoUrl: e.target.value })} required />
        </div>
        <div>
          <label className="label">{t("sso.x509_cert")}</label>
          <textarea className="input font-mono text-xs" rows={6}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={form.x509Cert}
            onChange={(e) => setForm({ ...form, x509Cert: e.target.value })} required={!cfg} />
          {cfg && !form.x509Cert && <p className="text-xs text-slate-500 mt-1">{t("sso.cert_stored")}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">{t("sso.email_attribute")}</label>
            <input className="input" value={form.emailAttribute}
              onChange={(e) => setForm({ ...form, emailAttribute: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("sso.name_attribute")}</label>
            <input className="input" value={form.nameAttribute}
              onChange={(e) => setForm({ ...form, nameAttribute: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("sso.default_role")}</label>
            <select className="input" value={form.defaultRole}
              onChange={(e) => setForm({ ...form, defaultRole: e.target.value as any })}>
              <option value="VIEWER">VIEWER</option>
              <option value="TESTER">TESTER</option>
              <option value="MANAGER">MANAGER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <button type="submit" className="btn-primary" disabled={save.isPending}>{t("common.save")}</button>
        </div>
      </form>

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold">{t("sso.scim_tokens")}</h2>
          <p className="text-sm text-slate-500">{t("sso.scim_hint")}</p>
        </div>

        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (tokenName.trim()) createToken.mutate(); }}
          className="flex gap-2"
        >
          <input
            className="input flex-1"
            placeholder={t("sso.scim_token_name_placeholder")}
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!tokenName.trim() || createToken.isPending}>
            {t("sso.issue_token")}
          </button>
        </form>

        {newToken && (
          <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100 p-3 space-y-2">
            <div className="text-sm font-semibold text-amber-900">{t("sso.token_shown_once")}</div>
            <div className="flex items-center gap-2 rounded-md bg-slate-900 text-slate-100 px-3 py-2 font-mono text-xs">
              <span className="flex-1 break-all">{newToken}</span>
              <button type="button" className="text-slate-300 hover:text-white flex items-center gap-1" onClick={copyToken}>
                <Copy size={14} /> {copied ? t("tokens.copied") : t("tokens.copy")}
              </button>
            </div>
            <button className="btn-secondary text-xs" onClick={() => setNewToken(null)}>{t("common.close")}</button>
          </div>
        )}

        {tokens.length === 0 ? (
          <div className="text-sm text-slate-500">{t("sso.no_scim_tokens")}</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tokens.map((tk) => (
              <li key={tk.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{tk.name}</div>
                  <div className="text-xs text-slate-500">
                    {t("sso.created")}: {new Date(tk.createdAt).toLocaleString()}
                    {tk.lastUsedAt && <> · {t("sso.last_used")}: {new Date(tk.lastUsedAt).toLocaleString()}</>}
                  </div>
                </div>
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => { if (confirm(t("sso.revoke_confirm"))) revokeToken.mutate(tk.id); }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

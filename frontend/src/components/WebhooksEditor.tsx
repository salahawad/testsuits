import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useConfirm } from "./ui/ConfirmDialog";
import { logger } from "../lib/logger";
import { Spinner } from "./Spinner";
import { Badge } from "./ui/Badge";

type Webhook = {
  id: string;
  projectId: string;
  url: string;
  events: string[];
  active: boolean;
  hasSecret: boolean;
  deliveries?: { id: string; event: string; status: number | null; error: string | null; attemptedAt: string }[];
};

export function WebhooksEditor({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const { data: events = [] } = useQuery<string[]>({
    queryKey: ["webhook-events"],
    queryFn: async () => (await api.get("/webhooks/events")).data,
  });
  const { data: hooks = [] } = useQuery<Webhook[]>({
    queryKey: ["webhooks", projectId],
    queryFn: async () => (await api.get("/webhooks", { params: { projectId } })).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/webhooks", {
        projectId,
        url,
        secret: secret || null,
        events: selected,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks", projectId] });
      setAddOpen(false);
      setUrl("");
      setSecret("");
      setSelected([]);
      setErr(null);
      toast.success(t("webhooks.created"));
      logger.info("webhook created", { projectId });
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Save failed"),
  });

  const toggle = useMutation({
    mutationFn: async (hook: Webhook) =>
      (await api.patch(`/webhooks/${hook.id}`, { active: !hook.active })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks", projectId] });
      toast.success(t("common.saved"));
    },
  });

  const remove = useMutation({
    mutationFn: async (hookId: string) => api.delete(`/webhooks/${hookId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks", projectId] });
      toast.success(t("common.deleted"));
    },
  });

  const test = useMutation({
    mutationFn: async (hookId: string) => (await api.post(`/webhooks/${hookId}/test`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks", projectId] });
      toast.success(t("webhooks.test_sent"));
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setErr(t("webhooks.pick_event"));
      return;
    }
    create.mutate();
  }

  return (
    <div className="card p-5 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t("webhooks.title")}</h2>
          <p className="text-xs text-slate-500">{t("webhooks.subtitle")}</p>
        </div>
        {canEdit && !addOpen && (
          <button className="btn-secondary" onClick={() => setAddOpen(true)}><Plus size={14} /> {t("webhooks.add")}</button>
        )}
      </header>

      {addOpen && canEdit && (
        <form onSubmit={onSubmit} className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-3">
          <div>
            <label className="label">{t("webhooks.url")}</label>
            <input className="input" type="url" required value={url} placeholder="https://example.com/hook"
              onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("webhooks.secret_optional")}</label>
            <input className="input" type="text" value={secret}
              placeholder={t("webhooks.secret_placeholder")}
              onChange={(e) => setSecret(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">{t("webhooks.secret_help")}</p>
          </div>
          <div>
            <label className="label">{t("webhooks.events")}</label>
            <div className="flex flex-wrap gap-2">
              {events.map((ev) => (
                <label key={ev} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.includes(ev)}
                    onChange={() => setSelected((xs) => xs.includes(ev) ? xs.filter((x) => x !== ev) : [...xs, ev])}
                  />
                  {ev}
                </label>
              ))}
            </div>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{t("common.create")}</button>
          </div>
        </form>
      )}

      {hooks.length === 0 && !addOpen && <div className="text-sm text-slate-500">{t("webhooks.empty")}</div>}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {hooks.map((h) => (
          <li key={h.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs truncate">{h.url}</div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  {h.events.map((ev) => <Badge key={ev} tone="neutral">{ev}</Badge>)}
                  {h.hasSecret && <Badge tone="success">{t("webhooks.signed")}</Badge>}
                  <Badge tone={h.active ? "success" : "neutral"}>
                    {h.active ? t("webhooks.active") : t("webhooks.inactive")}
                  </Badge>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button
                    className="btn-secondary"
                    onClick={() => test.mutate(h.id)}
                    disabled={test.isPending && test.variables === h.id}
                    title={t("webhooks.test")}
                  >
                    {test.isPending && test.variables === h.id
                      ? <Spinner size={14} className="text-slate-600" />
                      : <Zap size={14} />}
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => toggle.mutate(h)}
                    disabled={toggle.isPending && toggle.variables?.id === h.id}
                  >
                    {toggle.isPending && toggle.variables?.id === h.id && <Spinner size={12} className="text-slate-600" />}
                    {h.active ? t("webhooks.disable") : t("webhooks.enable")}
                  </button>
                  <button
                    className="btn-secondary text-red-600"
                    onClick={async () => { if (await confirmDialog({ title: t("webhooks.delete_confirm"), confirmLabel: t("common.delete"), tone: "danger" })) remove.mutate(h.id); }}
                    disabled={remove.isPending && remove.variables === h.id}
                  >
                    {remove.isPending && remove.variables === h.id
                      ? <Spinner size={14} className="text-red-600" />
                      : <Trash2 size={14} />}
                  </button>
                </div>
              )}
            </div>
            {h.deliveries && h.deliveries.length > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                <div className="font-semibold mb-1">{t("webhooks.recent_deliveries")}</div>
                <ul className="space-y-0.5">
                  {h.deliveries.map((d) => (
                    <li key={d.id} className="flex items-center gap-2">
                      <span className="font-mono">{new Date(d.attemptedAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>{d.event}</span>
                      <span>·</span>
                      <span className={d.error || (d.status && d.status >= 400) ? "text-red-600" : "text-emerald-700"}>
                        {d.status ?? "?"}{d.error ? ` – ${d.error}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

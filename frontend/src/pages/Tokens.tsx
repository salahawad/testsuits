import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { logger } from "../lib/logger";

type Token = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function Tokens() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: tokens = [], isLoading } = useQuery<Token[]>({
    queryKey: ["tokens"],
    queryFn: async () => (await api.get("/tokens")).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/tokens", { name })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      setPlaintext(data.plaintext);
      setName("");
      setErr(null);
      logger.info("api token created via UI");
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Create failed"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate();
  }

  function onCopy() {
    if (!plaintext) return;
    navigator.clipboard.writeText(plaintext).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function onCloseReveal() {
    setPlaintext(null);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("tokens.title")}</h1>
          <p className="text-sm text-slate-500">{t("tokens.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={() => { setOpen(true); setPlaintext(null); }}>
          <Plus size={16} /> {t("tokens.new")}
        </button>
      </header>

      {open && !plaintext && (
        <form onSubmit={onSubmit} className="card p-5 space-y-3">
          <div>
            <label className="label">{t("tokens.name_label")}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("tokens.name_placeholder") ?? "e.g. GitHub Actions"}
              autoFocus
              required
            />
            <p className="text-xs text-slate-500 mt-1">{t("tokens.name_help")}</p>
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

      {plaintext && (
        <div className="card p-5 space-y-3 border-l-4 border-amber-400">
          <div>
            <h2 className="font-semibold text-amber-800">{t("tokens.reveal_title")}</h2>
            <p className="text-sm text-slate-600 mt-1">{t("tokens.reveal_help")}</p>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-slate-900 text-slate-100 px-3 py-2 font-mono text-sm">
            <span className="flex-1 break-all">{plaintext}</span>
            <button
              type="button"
              className="text-slate-300 hover:text-white flex items-center gap-1 text-xs"
              onClick={onCopy}
            >
              <Copy size={14} /> {copied ? t("tokens.copied") : t("tokens.copy")}
            </button>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={onCloseReveal}>
              {t("tokens.ive_saved_it")}
            </button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {isLoading ? (
          <div className="px-5 py-4 text-sm text-slate-500">{t("common.loading")}</div>
        ) : tokens.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">{t("tokens.empty")}</div>
        ) : (
          tokens.map((tok) => (
            <div key={tok.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="font-medium">{tok.name}</div>
                <div className="text-xs text-slate-500">
                  {t("tokens.created_on", { date: new Date(tok.createdAt).toLocaleString() })}
                  {" · "}
                  {tok.lastUsedAt
                    ? t("tokens.last_used", { date: new Date(tok.lastUsedAt).toLocaleString() })
                    : t("tokens.never_used")}
                </div>
              </div>
              <button
                className="text-slate-400 hover:text-red-600"
                onClick={() => { if (confirm(t("tokens.revoke_confirm"))) revoke.mutate(tok.id); }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

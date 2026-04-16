import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../lib/api";
import { logger } from "../lib/logger";
import { Field } from "../components/Field";
import { useZodForm } from "../lib/useZodForm";
import { apiErrorMessage } from "../lib/apiError";
import { InlineLoader } from "../components/Spinner";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Alert } from "../components/ui/Alert";
import { useConfirm } from "../components/ui/ConfirmDialog";

type Token = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type Values = { name: string };

export function Tokens() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = useMemo(() => z.object({
    name: z.string().min(1, t("validation.name_required")).max(120, t("validation.name_too_long")),
  }), [t]);

  const form = useZodForm<Values>(schema, { defaultValues: { name: "" } });

  const { data: tokens = [], isLoading } = useQuery<Token[]>({
    queryKey: ["tokens"],
    queryFn: async () => (await api.get("/tokens")).data,
  });

  const create = useMutation({
    mutationFn: async (values: Values) => (await api.post("/tokens", values, { silent: true })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      setPlaintext(data.plaintext);
      form.reset({ name: "" });
      setSubmitError(null);
      logger.info("api token created via UI");
    },
    onError: (e: unknown) => {
      logger.warn("token creation failed", { err: e });
      setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      toast.success(t("tokens.revoked"));
      logger.info("api token revoked", { tokenId: id });
    },
  });

  function onCopy() {
    if (!plaintext) return;
    navigator.clipboard.writeText(plaintext).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function closeForm() {
    setOpen(false);
    form.reset({ name: "" });
    setSubmitError(null);
  }

  function onCloseReveal() {
    setPlaintext(null);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("tokens.title")}
        subtitle={t("tokens.subtitle")}
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => { setOpen(true); setPlaintext(null); setSubmitError(null); }}
          >
            {t("tokens.new")}
          </Button>
        }
      />

      {open && !plaintext && (
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="card p-5 space-y-3"
        >
          <Field
            name="name"
            label={t("tokens.name_label")}
            description={t("tokens.name_help")}
            error={form.formState.errors.name?.message}
          >
            <input
              className="input"
              autoFocus
              placeholder={t("tokens.name_placeholder") ?? "e.g. GitHub Actions"}
              {...form.register("name")}
            />
          </Field>
          {submitError && <Alert>{submitError}</Alert>}
          <div className="flex gap-2 justify-end">
            <Button type="button" onClick={closeForm}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t("common.create")}
            </Button>
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
            <Button variant="primary" onClick={onCloseReveal}>
              {t("tokens.ive_saved_it")}
            </Button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <InlineLoader />
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
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("common.delete")}
                className="text-slate-400 hover:text-red-600"
                loading={revoke.isPending && revoke.variables === tok.id}
                onClick={async () => {
                  if (await confirm({
                    title: t("tokens.revoke_confirm"),
                    confirmLabel: t("common.delete"),
                    tone: "danger",
                  })) revoke.mutate(tok.id);
                }}
              >
                {!(revoke.isPending && revoke.variables === tok.id) && <Trash2 size={14} />}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

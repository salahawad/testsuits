import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Trash2, ExternalLink } from "lucide-react";
import { z } from "zod";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Field } from "../components/Field";
import { useZodForm } from "../lib/useZodForm";
import { nonEmpty } from "../lib/schemas";
import { apiErrorMessage } from "../lib/apiError";
import { InlineLoader } from "../components/Spinner";

const schema = z.object({
  externalRef: nonEmpty("External reference").max(200),
  title: nonEmpty("Title").max(200),
  description: z.string().optional(),
});
type Values = z.infer<typeof schema>;

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
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useZodForm<Values>(schema, {
    defaultValues: { externalRef: "", title: "", description: "" },
  });

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
    mutationFn: async (values: Values) =>
      (await api.post(`/requirements`, { projectId, ...values, description: values.description || null }, { silent: true })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirements", projectId] });
      setOpen(false);
      form.reset({ externalRef: "", title: "", description: "" });
      setSubmitError(null);
    },
    onError: (e: unknown) => setSubmitError(apiErrorMessage(e, "Create failed")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/requirements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requirements", projectId] }),
  });

  const isUrl = (ref: string) => /^https?:\/\//.test(ref);

  function closeForm() {
    setOpen(false);
    form.reset({ externalRef: "", title: "", description: "" });
    setSubmitError(null);
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500">
        <Link to={`/projects/${projectId}`} className="hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={12} /> {project?.name ?? t("common.loading")}
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
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
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="card p-5 space-y-3"
        >
          <Field
            name="externalRef"
            label={t("requirements.external_ref")}
            description={t("requirements.external_ref_help")}
            error={form.formState.errors.externalRef?.message}
          >
            <input
              className="input"
              autoFocus
              placeholder="ACME-1201 or https://jira.example.com/browse/ACME-1201"
              {...form.register("externalRef")}
            />
          </Field>
          <Field name="title" label={t("requirements.req_title")} error={form.formState.errors.title?.message}>
            <input className="input" {...form.register("title")} />
          </Field>
          <Field name="description" label={t("requirements.description")} error={form.formState.errors.description?.message}>
            <textarea className="input" rows={3} {...form.register("description")} />
          </Field>
          {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={closeForm}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? t("common.please_wait") : t("common.create")}
            </button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <InlineLoader />
        ) : reqs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">{t("requirements.empty")}</div>
        ) : (
          reqs.map((r) => (
            <div key={r.id} className="flex items-start justify-between px-5 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 font-mono">
                    {isUrl(r.externalRef) ? (
                      <a href={r.externalRef} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                        {r.externalRef} <ExternalLink size={11} />
                      </a>
                    ) : (
                      r.externalRef
                    )}
                  </span>
                  <span className="font-medium">{r.title}</span>
                  <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
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

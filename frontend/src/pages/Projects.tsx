import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../lib/api";
import { Field } from "../components/Field";
import { useZodForm } from "../lib/useZodForm";
import { nonEmpty } from "../lib/schemas";
import { apiErrorMessage } from "../lib/apiError";
import { Badge } from "../components/ui/Badge";
import { useAuth } from "../lib/auth";

const schema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(16, "Key is too long")
    .regex(/^[A-Z0-9_-]+$/i, "Letters, numbers, - and _ only"),
  name: nonEmpty("Name"),
  description: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function Projects() {
  const { t } = useTranslation();
  const isManager = useAuth((s) => s.user?.role === "MANAGER" || s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useZodForm<Values>(schema, {
    defaultValues: { key: "", name: "", description: "" },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects")).data,
  });

  const create = useMutation({
    mutationFn: async (values: Values) =>
      (await api.post(
        "/projects",
        { key: values.key.toUpperCase(), name: values.name, description: values.description || null },
        { silent: true },
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      form.reset({ key: "", name: "", description: "" });
      setSubmitError(null);
    },
    onError: (e: unknown) => setSubmitError(apiErrorMessage(e, "Create failed")),
  });

  function closeForm() {
    setOpen(false);
    form.reset({ key: "", name: "", description: "" });
    setSubmitError(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("projects.title")}</h1>
          <p className="text-sm text-slate-500">{t("projects.subtitle")}</p>
        </div>
        {isManager && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("projects.new_project")}</button>}
      </header>

      {open && (
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="card p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field name="key" label={t("projects.key")} error={form.formState.errors.key?.message}>
              <input
                className="input uppercase"
                placeholder="AUTH"
                maxLength={16}
                {...form.register("key", {
                  onChange: (e) => {
                    e.target.value = e.target.value.toUpperCase();
                  },
                })}
              />
            </Field>
            <Field
              name="name"
              label={t("common.name")}
              error={form.formState.errors.name?.message}
              className="col-span-2"
            >
              <input className="input" {...form.register("name")} />
            </Field>
          </div>
          <Field name="description" label={t("common.description")} error={form.formState.errors.description?.message}>
            <textarea className="input" rows={2} {...form.register("description")} />
          </Field>
          {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={closeForm}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? t("common.please_wait") : t("common.create")}
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">{t("projects.empty")}</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card p-5 hover:border-brand-500 transition">
              <div className="flex items-center justify-between mb-2">
                <Badge tone="brand">{p.key}</Badge>
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

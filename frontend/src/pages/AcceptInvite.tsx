import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Field } from "../components/Field";
import { useZodForm } from "../lib/useZodForm";
import { passwordPolicy } from "../lib/schemas";
import { apiErrorMessage } from "../lib/apiError";
import { InlineLoader } from "../components/Spinner";

type Preview = {
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "TESTER" | "VIEWER";
  company: { id: string; name: string; slug: string };
};

const schema = z
  .object({
    password: passwordPolicy,
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });
type Values = z.infer<typeof schema>;

export function AcceptInvite() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useZodForm<Values>(schema, { defaultValues: { password: "", confirm: "" } });

  useEffect(() => {
    if (!token) return;
    api
      .get(`/auth/invite/${token}`, { silent: true })
      .then((r) => setPreview(r.data))
      .catch((e) => setLoadErr(apiErrorMessage(e, t("auth_reset.invite_invalid"))));
  }, [token, t]);

  async function onSubmit(values: Values) {
    setSubmitError(null);
    try {
      const { data } = await api.post(
        "/auth/accept-invite",
        { token, password: values.password },
        { silent: true },
      );
      setSession(data.token, data.user);
      navigate("/");
    } catch (e: unknown) {
      setSubmitError(apiErrorMessage(e, t("auth_reset.invite_invalid")));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="card w-full max-w-md p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">{t("auth_reset.invite_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth_reset.invite_help")}</p>
        </div>

        {loadErr ? (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200 text-sm p-3">
            {loadErr}
          </div>
        ) : !preview ? (
          <InlineLoader />
        ) : (
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm p-3 space-y-0.5">
              <div><span className="text-slate-500">{t("auth.email")}:</span> <span className="font-medium">{preview.email}</span></div>
              <div><span className="text-slate-500">{t("auth.name")}:</span> <span className="font-medium">{preview.name}</span></div>
              <div><span className="text-slate-500">{t("team.role")}:</span> <span className="font-medium">{t(`team.${preview.role.toLowerCase()}`)}</span></div>
              <div><span className="text-slate-500">{t("nav.company")}:</span> <span className="font-medium">{preview.company.name}</span></div>
            </div>
            <Field name="password" label={t("auth.password")} error={form.formState.errors.password?.message}>
              <input type="password" autoComplete="new-password" autoFocus className="input" {...form.register("password")} />
            </Field>
            <Field
              name="confirm"
              label={t("auth.confirm_password", { defaultValue: "Confirm password" })}
              error={form.formState.errors.confirm?.message}
            >
              <input type="password" autoComplete="new-password" className="input" {...form.register("confirm")} />
            </Field>
            {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
            <button type="submit" className="btn-primary w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.please_wait") : t("auth_reset.invite_submit")}
            </button>
          </form>
        )}

        <div className="text-center text-sm">
          <Link to="/login" className="text-brand-600 hover:underline">
            {t("auth_reset.back_to_login")}
          </Link>
        </div>
      </div>
    </div>
  );
}

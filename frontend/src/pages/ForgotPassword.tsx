import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../lib/api";
import { logger } from "../lib/logger";
import { Field } from "../components/Field";
import { useZodForm } from "../lib/useZodForm";
import { emailFieldWithMessages } from "../lib/schemas";
import { apiErrorMessage } from "../lib/apiError";

type Values = { email: string };

export function ForgotPassword() {
  const { t } = useTranslation();

  const schema = useMemo(() => z.object({ email: emailFieldWithMessages(t) }), [t]);

  const [submitted, setSubmitted] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useZodForm<Values>(schema, { defaultValues: { email: "" } });

  async function onSubmit(values: Values) {
    setSubmitError(null);
    try {
      const { data } = await api.post("/auth/forgot", values, { silent: true });
      setSubmitted(true);
      if (data.devToken) setDevToken(data.devToken);
      logger.info("password reset requested");
    } catch (e: unknown) {
      logger.warn("forgot password request failed", { err: e });
      setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="card w-full max-w-md p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">{t("auth_reset.forgot_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth_reset.forgot_help")}</p>
        </div>

        {submitted ? (
          <>
            <div className="rounded-md bg-green-50 border border-green-200 text-green-800 text-sm p-3">
              {t("auth_reset.forgot_sent")}
            </div>
            {devToken && import.meta.env.DEV && (
              <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100 p-3 text-sm space-y-1">
                <div className="font-semibold text-amber-900">{t("auth_reset.forgot_dev_link")}</div>
                <a
                  href={`/reset/${devToken}`}
                  className="text-brand-600 hover:underline break-all font-mono text-xs"
                >
                  {window.location.origin}/reset/{devToken}
                </a>
              </div>
            )}
          </>
        ) : (
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Field name="email" label={t("auth.email")} error={form.formState.errors.email?.message}>
              <input type="email" autoComplete="email" autoFocus className="input" {...form.register("email")} />
            </Field>
            {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
            <button type="submit" className="btn-primary w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.please_wait") : t("auth_reset.forgot_submit")}
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

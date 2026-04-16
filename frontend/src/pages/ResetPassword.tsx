import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../lib/api";
import { logger } from "../lib/logger";
import { Field } from "../components/Field";
import { PasswordInput } from "../components/PasswordInput";
import { useZodForm } from "../lib/useZodForm";
import { passwordPolicyWithMessages } from "../lib/schemas";
import { apiErrorMessage } from "../lib/apiError";

type Values = { password: string; confirm: string };

export function ResetPassword() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const schema = useMemo(() => z
    .object({
      password: passwordPolicyWithMessages(t),
      confirm: z.string().min(1, t("validation.confirm_password_required")),
    })
    .refine((v) => v.password === v.confirm, {
      path: ["confirm"],
      message: t("validation.passwords_no_match"),
    }), [t]);

  const form = useZodForm<Values>(schema, { defaultValues: { password: "", confirm: "" } });

  async function onSubmit(values: Values) {
    setSubmitError(null);
    try {
      await api.post("/auth/reset", { token, password: values.password }, { silent: true });
      setDone(true);
      logger.info("password reset");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e: unknown) {
      logger.warn("password reset failed", { err: e });
      setSubmitError(apiErrorMessage(e, t("auth_reset.reset_invalid")));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="card w-full max-w-md p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">{t("auth_reset.reset_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth_reset.reset_help")}</p>
        </div>

        {done ? (
          <div className="rounded-md bg-green-50 border border-green-200 text-green-800 text-sm p-3">
            {t("auth_reset.reset_success")}
          </div>
        ) : (
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Field name="password" label={t("auth.password")} error={form.formState.errors.password?.message}>
              <PasswordInput autoComplete="new-password" autoFocus className="input" {...form.register("password")} />
            </Field>
            <Field
              name="confirm"
              label={t("auth.confirm_password", { defaultValue: "Confirm password" })}
              error={form.formState.errors.confirm?.message}
            >
              <PasswordInput autoComplete="new-password" className="input" {...form.register("confirm")} />
            </Field>
            {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
            <button type="submit" className="btn-primary w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.please_wait") : t("auth_reset.reset_submit")}
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

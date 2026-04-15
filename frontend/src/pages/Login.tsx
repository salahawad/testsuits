import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "../lib/auth";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";
import { Field } from "../components/Field";
import { LOGIN_FLASH_KEY } from "../lib/api";
import { apiErrorMessage } from "../lib/apiError";
import { logger } from "../lib/logger";
import { useZodForm } from "../lib/useZodForm";
import { emailField, loginPassword, passwordPolicy, nonEmpty } from "../lib/schemas";

const loginSchema = z.object({
  email: emailField,
  password: loginPassword,
});

const signupSchema = z.object({
  email: emailField,
  password: passwordPolicy,
  name: nonEmpty("Name"),
  companyName: nonEmpty("Company name"),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

export function Login() {
  const { t } = useTranslation();
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loginForm = useZodForm<LoginValues>(loginSchema, {
    defaultValues: { email: "", password: "" },
  });
  const signupForm = useZodForm<SignupValues>(signupSchema, {
    defaultValues: { email: "", password: "", name: "", companyName: "" },
  });

  useEffect(() => {
    const flash = localStorage.getItem(LOGIN_FLASH_KEY);
    if (flash) {
      localStorage.removeItem(LOGIN_FLASH_KEY);
      toast.warning(flash);
    }
  }, []);

  if (user) return <Navigate to="/" replace />;

  const busy = loginForm.formState.isSubmitting || signupForm.formState.isSubmitting;

  async function onLogin(values: LoginValues) {
    setSubmitError(null);
    try {
      await login(values.email, values.password);
      logger.info("auth success", { mode: "login", email: values.email });
      navigate("/");
    } catch (e: unknown) {
      logger.warn("auth failed", { mode: "login", email: values.email });
      setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
    }
  }

  async function onSignup(values: SignupValues) {
    setSubmitError(null);
    try {
      await signup(values.email, values.password, values.name, values.companyName);
      logger.info("auth success", { mode: "signup", email: values.email });
      navigate("/");
    } catch (e: unknown) {
      logger.warn("auth failed", { mode: "signup", email: values.email });
      setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
    }
  }

  function switchMode(to: "login" | "signup") {
    setMode(to);
    setSubmitError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Logo size={40} withWordmark textClassName="text-2xl font-bold tracking-tight text-brand-600" />
            <p className="text-sm text-slate-500 mt-2">{t("app.tagline")}</p>
          </div>
          <LanguageSwitcher />
        </div>

        {mode === "login" ? (
          <form noValidate onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
            <Field name="email" label={t("auth.email")} error={loginForm.formState.errors.email?.message}>
              <input type="email" autoComplete="email" className="input" {...loginForm.register("email")} />
            </Field>
            <Field name="password" label={t("auth.password")} error={loginForm.formState.errors.password?.message}>
              <input type="password" autoComplete="current-password" className="input" {...loginForm.register("password")} />
            </Field>
            {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t("common.please_wait") : t("auth.sign_in")}
            </button>
          </form>
        ) : (
          <form noValidate onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
            <Field
              name="companyName"
              label={t("auth.company_name")}
              description={t("auth.company_name_help")}
              error={signupForm.formState.errors.companyName?.message}
            >
              <input className="input" autoComplete="organization" {...signupForm.register("companyName")} />
            </Field>
            <Field name="name" label={t("auth.name")} error={signupForm.formState.errors.name?.message}>
              <input className="input" autoComplete="name" {...signupForm.register("name")} />
            </Field>
            <Field name="email" label={t("auth.email")} error={signupForm.formState.errors.email?.message}>
              <input type="email" autoComplete="email" className="input" {...signupForm.register("email")} />
            </Field>
            <Field name="password" label={t("auth.password")} error={signupForm.formState.errors.password?.message}>
              <input type="password" autoComplete="new-password" className="input" {...signupForm.register("password")} />
            </Field>
            {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t("common.please_wait") : t("auth.create_company")}
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          <button
            type="button"
            className="text-brand-600 hover:underline"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? t("auth.no_company") : t("auth.have_account")}
          </button>
          {mode === "login" && (
            <Link to="/forgot-password" className="text-slate-500 hover:text-brand-600 hover:underline">
              {t("auth_reset.forgot_link")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

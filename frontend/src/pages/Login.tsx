import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { z } from "zod";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";
import { Field } from "../components/Field";
import { PasswordInput } from "../components/PasswordInput";
import { LOGIN_FLASH_KEY } from "../lib/api";
import { apiErrorMessage } from "../lib/apiError";
import { logger } from "../lib/logger";
import { useZodForm } from "../lib/useZodForm";
import { emailFieldWithMessages, loginPasswordWithMessages, passwordPolicyWithMessages } from "../lib/schemas";

type LoginValues = { email: string; password: string };
type SignupValues = { email: string; password: string; name: string; companyName: string };

export function Login() {
  const { t } = useTranslation();

  const loginSchema = useMemo(() => z.object({
    email: emailFieldWithMessages(t),
    password: loginPasswordWithMessages(t),
  }), [t]);

  const signupSchema = useMemo(() => z.object({
    email: emailFieldWithMessages(t),
    password: passwordPolicyWithMessages(t),
    name: z.string().min(1, t("validation.name_required")),
    companyName: z.string().min(1, t("validation.company_name_required")),
  }), [t]);

  const { user, login, signup, setSession } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Post-signup state: show "check your email" screen.
  const [signupDone, setSignupDone] = useState(false);
  const [signupDevToken, setSignupDevToken] = useState<string | null>(null);

  // Email-not-verified state: show resend button.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // Remember me.
  const [rememberMe, setRememberMe] = useState(false);

  // 2FA challenge state.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeRememberMe, setChallengeRememberMe] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);

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
    setUnverifiedEmail(null);
    try {
      const result = await login(values.email, values.password, rememberMe);
      if (result.kind === "2fa") {
        setChallengeToken(result.challengeToken);
        setChallengeRememberMe(result.rememberMe ?? false);
        logger.info("2fa challenge", { email: values.email });
        return;
      }
      logger.info("auth success", { mode: "login", email: values.email });
      navigate("/");
    } catch (e: unknown) {
      logger.warn("auth failed", { mode: "login", email: values.email });
      const ax = e as AxiosError<{ error?: string; code?: string }>;
      if (ax.response?.data?.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(values.email);
      } else {
        setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
      }
    }
  }

  async function onSignup(values: SignupValues) {
    setSubmitError(null);
    try {
      const result = await signup(values.email, values.password, values.name, values.companyName);
      logger.info("signup success — verification email sent", { email: values.email });
      setSignupDone(true);
      if (result.devToken) setSignupDevToken(result.devToken);
    } catch (e: unknown) {
      logger.warn("signup failed", { email: values.email });
      setSubmitError(apiErrorMessage(e, t("common.something_went_wrong")));
    }
  }

  async function onResendVerification() {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await api.post("/auth/resend-verification", { email: unverifiedEmail }, { silent: true });
      toast.success(t("verify_email.resent"));
    } catch (e) {
      logger.warn("resend verification failed", { err: e });
      toast.error(t("common.something_went_wrong"));
    } finally {
      setResending(false);
    }
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken || totpCode.length !== 6) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      const { data } = await api.post("/2fa/authenticate", {
        challengeToken, code: totpCode, trustDevice, rememberMe: challengeRememberMe,
      }, { silent: true });
      if (data.trustToken) localStorage.setItem("trustToken", data.trustToken);
      setSession(data.token, data.user);
      logger.info("2fa auth success");
      navigate("/");
    } catch (e: unknown) {
      logger.warn("2fa authentication failed", { err: e });
      setTotpError(apiErrorMessage(e, t("common.something_went_wrong")));
    } finally {
      setTotpBusy(false);
    }
  }

  function switchMode(to: "login" | "signup") {
    setMode(to);
    setSubmitError(null);
    setUnverifiedEmail(null);
    setChallengeToken(null);
    setSignupDone(false);
  }

  // --- 2FA code entry screen ------------------------------------------------
  if (challengeToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="card w-full max-w-md p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <Logo size={40} withWordmark textClassName="text-2xl font-bold tracking-tight text-brand-600" />
              <p className="text-sm text-slate-500 mt-2">{t("twofa.login_title")}</p>
            </div>
            <LanguageSwitcher />
          </div>

          <form onSubmit={onTotpSubmit} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">{t("twofa.login_help")}</p>
            <Field name="totp" label={t("twofa.code_label")} error={totpError ?? undefined}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                className="input text-center text-lg tracking-widest font-mono"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} className="rounded border-slate-300 dark:border-slate-600" />
              {t("twofa.trust_device")}
            </label>
            <button type="submit" disabled={totpBusy || totpCode.length !== 6} className="btn-primary w-full">
              {totpBusy ? t("common.please_wait") : t("twofa.verify")}
            </button>
          </form>

          <div className="mt-4 text-center text-sm">
            <button type="button" className="text-slate-500 hover:text-brand-600 hover:underline" onClick={() => { setChallengeToken(null); setTotpCode(""); setTotpError(null); }}>
              {t("auth_reset.back_to_login")}
            </button>
          </div>
        </div>
      </div>
    );
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

        {/* Signup success: check your email */}
        {signupDone ? (
          <>
            <div className="rounded-md bg-green-50 border border-green-200 text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-200 text-sm p-3">
              {t("verify_email.signup_sent")}
            </div>
            {signupDevToken && import.meta.env.DEV && (
              <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100 p-3 text-sm space-y-1">
                <div className="font-semibold text-amber-900 dark:text-amber-200">{t("verify_email.dev_link")}</div>
                <a
                  href={`/verify-email/${signupDevToken}`}
                  className="text-brand-600 hover:underline break-all font-mono text-xs"
                >
                  {window.location.origin}/verify-email/{signupDevToken}
                </a>
              </div>
            )}
            <div className="mt-4 text-center text-sm">
              <button type="button" className="text-brand-600 hover:underline" onClick={() => switchMode("login")}>
                {t("auth_reset.back_to_login")}
              </button>
            </div>
          </>
        ) : mode === "login" ? (
          <>
            <form noValidate onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
              <Field name="email" label={t("auth.email")} error={loginForm.formState.errors.email?.message}>
                <input type="email" autoComplete="email" className="input" {...loginForm.register("email")} />
              </Field>
              <Field name="password" label={t("auth.password")} error={loginForm.formState.errors.password?.message}>
                <PasswordInput autoComplete="current-password" className="input" {...loginForm.register("password")} />
              </Field>
              {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
              {unverifiedEmail && (
                <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 text-sm p-3 space-y-2">
                  <p className="text-amber-900 dark:text-amber-100">{t("verify_email.not_verified")}</p>
                  <button type="button" disabled={resending} onClick={onResendVerification} className="text-brand-600 hover:underline text-sm font-medium">
                    {resending ? t("common.please_wait") : t("verify_email.resend")}
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-slate-300 dark:border-slate-600" />
                {t("auth.remember_me")}
              </label>
              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? t("common.please_wait") : t("auth.sign_in")}
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-2 text-sm">
              <button type="button" className="text-brand-600 hover:underline" onClick={() => switchMode("signup")}>
                {t("auth.no_company")}
              </button>
              <Link to="/forgot-password" className="text-slate-500 hover:text-brand-600 hover:underline">
                {t("auth_reset.forgot_link")}
              </Link>
            </div>
          </>
        ) : (
          <>
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
                <PasswordInput autoComplete="new-password" className="input" {...signupForm.register("password")} />
              </Field>
              {submitError && <div role="alert" className="text-sm text-red-600">{submitError}</div>}
              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? t("common.please_wait") : t("auth.create_company")}
              </button>
            </form>

            <div className="mt-4 text-center text-sm">
              <button type="button" className="text-brand-600 hover:underline" onClick={() => switchMode("login")}>
                {t("auth.have_account")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

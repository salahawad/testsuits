import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { logger } from "../lib/logger";

export function Login() {
  const { t } = useTranslation();
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password, name, companyName);
      logger.info("auth success", { mode, email });
      navigate("/");
    } catch (e: any) {
      logger.warn("auth failed", { mode, email, status: e.response?.status });
      setErr(e.response?.data?.error ?? t("common.something_went_wrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1 text-brand-600">{t("app.name")}</h1>
            <p className="text-sm text-slate-500">{t("app.tagline")}</p>
          </div>
          <LanguageSwitcher />
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="label">{t("auth.company_name")}</label>
                <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                <p className="text-xs text-slate-500 mt-1">{t("auth.company_name_help")}</p>
              </div>
              <div>
                <label className="label">{t("auth.name")}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </>
          )}
          <div>
            <label className="label">{t("auth.email")}</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("auth.password")}</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t("common.please_wait") : mode === "login" ? t("auth.sign_in") : t("auth.create_company")}
          </button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          <button
            type="button"
            className="text-brand-600 hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
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

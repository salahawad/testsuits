import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot", { email });
      setSubmitted(true);
      if (data.devToken) setDevToken(data.devToken);
    } catch (e: any) {
      setErr(e.response?.data?.error ?? t("common.something_went_wrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
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
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">
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
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">{t("auth.email")}</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? t("common.please_wait") : t("auth_reset.forgot_submit")}
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

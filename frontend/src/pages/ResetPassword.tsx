import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

export function ResetPassword() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) {
      setErr(t("auth.passwords_dont_match", { defaultValue: "Passwords don't match" }) as string);
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (e: any) {
      setErr(e.response?.data?.error ?? t("auth_reset.reset_invalid"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
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
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">{t("auth.password")}</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
            </div>
            <div>
              <label className="label">{t("auth.confirm_password", { defaultValue: "Confirm password" })}</label>
              <input
                type="password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? t("common.please_wait") : t("auth_reset.reset_submit")}
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

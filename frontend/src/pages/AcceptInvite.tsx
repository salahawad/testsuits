import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Preview = {
  email: string;
  name: string;
  role: "MANAGER" | "TESTER";
  company: { id: string; name: string; slug: string };
};

export function AcceptInvite() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get(`/auth/invite/${token}`)
      .then((r) => setPreview(r.data))
      .catch((e) => setLoadErr(e.response?.data?.error ?? t("auth_reset.invite_invalid")));
  }, [token, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) {
      setErr(t("auth.passwords_dont_match", { defaultValue: "Passwords don't match" }) as string);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/accept-invite", { token, password });
      // Drop the new user straight into the app — no second sign-in.
      setSession(data.token, data.user);
      navigate("/");
    } catch (e: any) {
      setErr(e.response?.data?.error ?? t("auth_reset.invite_invalid"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">{t("auth_reset.invite_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth_reset.invite_help")}</p>
        </div>

        {loadErr ? (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm p-3">
            {loadErr}
          </div>
        ) : !preview ? (
          <div className="text-sm text-slate-500">{t("common.loading")}</div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="rounded-md bg-slate-50 border border-slate-200 text-sm p-3 space-y-0.5">
              <div><span className="text-slate-500">{t("auth.email")}:</span> <span className="font-medium">{preview.email}</span></div>
              <div><span className="text-slate-500">{t("auth.name")}:</span> <span className="font-medium">{preview.name}</span></div>
              <div><span className="text-slate-500">{t("team.role")}:</span> <span className="font-medium">{t(`team.${preview.role.toLowerCase()}`)}</span></div>
              <div><span className="text-slate-500">{t("nav.company")}:</span> <span className="font-medium">{preview.company.name}</span></div>
            </div>
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
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? t("common.please_wait") : t("auth_reset.invite_submit")}
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

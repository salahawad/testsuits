import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { apiErrorMessage } from "../lib/apiError";
import { InlineLoader } from "../components/Spinner";
import { logger } from "../lib/logger";

export function VerifyEmail() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .post("/auth/verify-email", { token }, { silent: true })
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.token, data.user);
        logger.info("email verified — auto-login");
        navigate("/", { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        logger.warn("email verification failed", { err: e });
        setError(apiErrorMessage(e, t("verify_email.invalid")));
      });
    return () => { cancelled = true; };
  }, [token, navigate, setSession, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="card w-full max-w-md p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">{t("verify_email.title")}</h1>
        </div>

        {error ? (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200 text-sm p-3">
            {error}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <InlineLoader />
            <p className="text-sm text-slate-500">{t("verify_email.verifying")}</p>
          </div>
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

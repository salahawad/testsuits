import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home } from "lucide-react";

export function NotFound() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="card p-8 max-w-lg text-center space-y-3">
        <div className="text-5xl font-bold text-slate-300">404</div>
        <h1 className="text-2xl font-bold">{t("notfound.title")}</h1>
        <p className="text-sm text-slate-600">{t("notfound.body")}</p>
        <code className="inline-block text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded font-mono break-all">
          {pathname}
        </code>
        <div className="flex gap-2 justify-center pt-2">
          <button className="btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> {t("notfound.back")}
          </button>
          <Link to="/" className="btn-primary">
            <Home size={14} /> {t("notfound.go_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

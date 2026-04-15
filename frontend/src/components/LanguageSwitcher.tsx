import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../i18n";
import { logger } from "../lib/logger";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    i18n.changeLanguage(code).then(() => {
      document.documentElement.lang = code;
      logger.info("language changed", { code });
    });
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <Globe size={14} />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
        value={i18n.resolvedLanguage}
        onChange={onChange}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}

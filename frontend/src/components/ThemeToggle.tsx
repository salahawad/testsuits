import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { useTheme } from "../lib/theme";

type Props = {
  collapsed?: boolean;
};

/**
 * Small inline button that flips between light and dark. Default is light;
 * the user's choice is persisted in localStorage and applied pre-hydration
 * (see index.html) so there's no flash on refresh.
 */
export function ThemeToggle({ collapsed }: Props) {
  const { t } = useTranslation();
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const isDark = theme === "dark";
  const label = isDark ? t("theme.switch_to_light") : t("theme.switch_to_dark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={clsx(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
        collapsed && "justify-center px-2",
        "text-slate-600 hover:bg-slate-50",
        "dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {!collapsed && <span className="truncate">{isDark ? t("theme.light") : t("theme.dark")}</span>}
    </button>
  );
}

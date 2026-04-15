import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, PlayCircle, Grid3x3, Users,
  Building2, LogOut, ChevronLeft, ChevronRight, Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { SUPPORTED_LANGUAGES } from "../i18n";
import { logger } from "../lib/logger";
import clsx from "clsx";

const COLLAPSE_KEY = "ts_nav_collapsed";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const isManager = user?.role === "MANAGER";

  const nav = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/projects", icon: FolderKanban, label: t("nav.projects") },
    { to: "/runs", icon: PlayCircle, label: t("nav.runs") },
    { to: "/matrix", icon: Grid3x3, label: t("matrix.title") },
  ];
  const adminNav = [
    { to: "/team", icon: Users, label: t("team.title") },
    { to: "/company", icon: Building2, label: t("company.settings_title") },
  ];

  function changeLang(code: string) {
    i18n.changeLanguage(code).then(() => {
      document.documentElement.lang = code;
      logger.info("language changed", { code });
    });
  }

  const companyInitials = user?.company?.name
    ?.split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  return (
    <div className="flex h-screen">
      <aside
        className={clsx(
          "border-r border-slate-200 bg-white flex flex-col transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="h-14 flex items-center justify-between px-3 border-b border-slate-200">
          {!collapsed && (
            <Link to="/" className="text-lg font-bold text-brand-600 px-2">
              {t("app.name")}
            </Link>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
            aria-label={collapsed ? "Expand" : "Collapse"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {user?.company && (
          <div
            className={clsx(
              "border-b border-slate-100 px-3 py-3 flex items-center gap-3",
              collapsed && "justify-center",
            )}
            title={user.company.name}
          >
            <div className="w-8 h-8 rounded-md bg-brand-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {companyInitials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("nav.company")}</div>
                <div className="text-sm font-semibold truncate">{user.company.name}</div>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  collapsed && "justify-center px-2",
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50",
                )
              }
            >
              <Icon size={18} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}

          {!collapsed && isManager && (
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-4 mb-1 px-3">
              {t("nav.admin")}
            </div>
          )}
          {!collapsed && !isManager && <div className="mt-4" />}
          {adminNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  collapsed && "justify-center px-2",
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50",
                )
              }
            >
              <Icon size={18} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-2 space-y-2">
          {!collapsed ? (
            <label className="flex items-center gap-2 text-xs text-slate-600 px-2">
              <Globe size={14} />
              <select
                className="bg-transparent border border-slate-200 rounded px-2 py-1 text-xs flex-1"
                value={i18n.resolvedLanguage}
                onChange={(e) => changeLang(e.target.value)}
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <button
              onClick={() => changeLang(i18n.resolvedLanguage === "fr" ? "en" : "fr")}
              className="w-full flex items-center justify-center p-2 rounded hover:bg-slate-100 text-slate-500"
              title={t("nav.language")}
            >
              <Globe size={16} />
            </button>
          )}

          {!collapsed ? (
            <div className="px-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{t("nav.signed_in_as")}</div>
              <div className="text-sm font-medium flex items-center gap-2 mt-0.5">
                <span className="truncate flex-1">{user?.name}</span>
                {user?.role && (
                  <span
                    className={clsx(
                      "badge text-[10px]",
                      user.role === "MANAGER"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {t(`team.${user.role.toLowerCase()}`)}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  logger.info("user logout", { userId: user?.id });
                  logout();
                  navigate("/login");
                }}
                className="btn-secondary w-full mt-2"
              >
                <LogOut size={14} /> {t("nav.logout")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                logger.info("user logout", { userId: user?.id });
                logout();
                navigate("/login");
              }}
              className="w-full flex items-center justify-center p-2 rounded hover:bg-slate-100 text-slate-500"
              title={t("nav.logout")}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

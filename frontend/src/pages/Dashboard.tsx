import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bug,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderKanban,
  ListChecks,
  Play,
  Target,
} from "lucide-react";
import { api } from "../lib/api";
import { priorityColors, runStatusColors } from "../lib/status";
import { logger } from "../lib/logger";

type StatusKey = "PENDING" | "PASSED" | "FAILED" | "BLOCKED" | "SKIPPED";

const statusMeta: Record<StatusKey, { label: string; bar: string; dot: string; text: string }> = {
  PASSED:  { label: "Passed",  bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" },
  FAILED:  { label: "Failed",  bar: "bg-red-500",     dot: "bg-red-500",     text: "text-red-700" },
  BLOCKED: { label: "Blocked", bar: "bg-amber-500",   dot: "bg-amber-500",   text: "text-amber-700" },
  SKIPPED: { label: "Skipped", bar: "bg-slate-400",   dot: "bg-slate-400",   text: "text-slate-600" },
  PENDING: { label: "Pending", bar: "bg-slate-200",   dot: "bg-slate-300",   text: "text-slate-500" },
};

const statusOrder: StatusKey[] = ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "PENDING"];

export function Dashboard() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard")).data,
  });

  if (error) logger.error("dashboard fetch failed", { error: String(error) });
  if (isLoading) return <div className="text-slate-500">{t("common.loading")}</div>;
  if (!data) return null;

  const passRate = data.passRate as number;
  const passTone =
    passRate >= 85 ? "emerald" : passRate >= 60 ? "amber" : "red";

  const stats = [
    { label: t("dashboard.projects"), value: data.totals.projects, icon: FolderKanban, tone: "indigo" },
    { label: t("dashboard.cases"),    value: data.totals.cases,    icon: FileText,     tone: "slate" },
    { label: t("dashboard.runs"),     value: data.totals.runs,     icon: Play,         tone: "violet" },
    { label: t("dashboard.pass_rate"), value: `${passRate}%`,      icon: Target,       tone: passTone },
    { label: t("dashboard.my_open"),  value: data.totals.myOpen ?? 0,   icon: ListChecks, tone: "amber" },
    { label: t("dashboard.open_bugs"),value: data.totals.openBugs ?? 0, icon: Bug,        tone: "red" },
  ] as const;

  const toneClasses: Record<string, { border: string; bg: string; icon: string; text: string }> = {
    indigo:  { border: "border-l-indigo-500",  bg: "bg-indigo-50",  icon: "text-indigo-600",  text: "text-indigo-900" },
    slate:   { border: "border-l-slate-400",   bg: "bg-slate-50",   icon: "text-slate-600",   text: "text-slate-900" },
    violet:  { border: "border-l-violet-500",  bg: "bg-violet-50",  icon: "text-violet-600",  text: "text-violet-900" },
    emerald: { border: "border-l-emerald-500", bg: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-900" },
    amber:   { border: "border-l-amber-500",   bg: "bg-amber-50",   icon: "text-amber-600",   text: "text-amber-900" },
    red:     { border: "border-l-red-500",     bg: "bg-red-50",     icon: "text-red-600",     text: "text-red-900" },
  };

  const totalExec = data.totals.executions as number;
  const sc = data.statusCounts as Record<StatusKey, number>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-500">{t("dashboard.subtitle")}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => {
          const c = toneClasses[s.tone];
          const Icon = s.icon;
          return (
            <div key={s.label} className={`card p-5 border-l-4 ${c.border} ${c.bg}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold uppercase text-slate-600">{s.label}</div>
                <Icon size={18} className={c.icon} />
              </div>
              <div className={`text-3xl font-bold mt-2 ${c.text}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{t("dashboard.execution_status")}</h2>
          <span className="text-xs text-slate-500">{totalExec} total</span>
        </div>
        {totalExec === 0 ? (
          <div className="text-sm text-slate-500">—</div>
        ) : (
          <>
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100">
              {statusOrder.map((s) => {
                const count = sc[s] ?? 0;
                if (!count) return null;
                const pct = (count / totalExec) * 100;
                return (
                  <div
                    key={s}
                    className={statusMeta[s].bar}
                    style={{ width: `${pct}%` }}
                    title={`${statusMeta[s].label}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              {statusOrder.map((s) => {
                const count = sc[s] ?? 0;
                const pct = totalExec > 0 ? Math.round((count / totalExec) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusMeta[s].dot}`} />
                    <div className="min-w-0">
                      <div className={`text-xs uppercase font-semibold ${statusMeta[s].text}`}>{s}</div>
                      <div className="text-sm font-medium">
                        {count} <span className="text-slate-400 text-xs">· {pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <ListChecks size={16} className="text-amber-600" />
            {t("dashboard.my_assignments")}
          </h2>
          {(data.myAssignments ?? []).length === 0 ? (
            <div className="text-sm text-slate-500">{t("dashboard.no_assignments")}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.myAssignments.map((e: any) => (
                <li key={e.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/runs/${e.run.id}`} className="font-medium hover:underline truncate block">
                      {e.case.title}
                    </Link>
                    <div className="text-xs text-slate-500 truncate">
                      {e.run.project.name} · {e.run.name}
                      {e.run.dueDate && <> · {t("dashboard.due", { date: new Date(e.run.dueDate).toLocaleDateString() })}</>}
                    </div>
                  </div>
                  <span className={`badge ${priorityColors[e.case.priority]}`}>{e.case.priority}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Play size={16} className="text-violet-600" />
            {t("dashboard.active_runs")}
          </h2>
          {(data.activeRuns ?? []).length === 0 ? (
            <div className="text-sm text-slate-500">{t("dashboard.no_active_runs")}</div>
          ) : (
            <ul className="space-y-3">
              {data.activeRuns.map((r: any) => (
                <li key={r.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Link to={`/runs/${r.id}`} className="font-medium hover:underline truncate">
                      {r.name}
                    </Link>
                    <span className="text-xs text-slate-500 shrink-0">{r.done}/{r.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${r.progress}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <span>{r.project.name}</span>
                    {r.passed > 0 && <span className="text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 size={12} /> {r.passed}</span>}
                    {r.failed > 0 && <span className="text-red-600">✗ {r.failed}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4">{t("dashboard.recent_runs")}</h2>
          {data.recentRuns.length === 0 ? (
            <div className="text-sm text-slate-500">{t("dashboard.no_runs")}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentRuns.map((r: any) => (
                <li key={r.id} className="py-2 flex items-center justify-between">
                  <div>
                    <Link to={`/runs/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    <div className="text-xs text-slate-500">{r.project.name} · {r._count.executions}</div>
                  </div>
                  <span className={`badge ${runStatusColors[r.status]}`}>{r.status.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <CalendarClock size={16} className="text-indigo-600" />
            {t("dashboard.upcoming_milestones")}
          </h2>
          {(data.upcomingMilestones ?? []).length === 0 ? (
            <div className="text-sm text-slate-500">{t("dashboard.no_upcoming_milestones")}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcomingMilestones.map((m: any) => (
                <li key={m.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {m.project.name} · {t("milestones.runs_count", { count: m._count.runs })}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">
                    {m.dueDate && new Date(m.dueDate).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600" />
            {t("dashboard.top_failing_cases")}
          </h2>
          {(data.topFailingCases ?? []).length === 0 ? (
            <div className="text-sm text-slate-500">{t("dashboard.no_failing_cases")}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topFailingCases.map((c: any) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/cases/${c.id}`} className="font-medium hover:underline truncate block">
                      {c.title}
                    </Link>
                    <div className="text-xs text-slate-500 truncate">
                      {c.suite.project.name} · {c.suite.name}
                    </div>
                  </div>
                  <span className="badge bg-red-100 text-red-700 flex items-center gap-1 shrink-0">
                    <Bug size={12} /> {c.failures}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

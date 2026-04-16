import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

const ACTION_KEYS: Record<string, string> = {
  CASE_CREATED: "activity.case_created",
  CASE_UPDATED: "activity.case_updated",
  CASE_CLONED: "activity.case_cloned",
  RUN_CREATED: "activity.run_created",
  RUN_STATUS_CHANGED: "activity.run_status_changed",
  EXECUTION_STATUS_CHANGED: "activity.execution_status_changed",
  EXECUTION_ASSIGNED: "activity.execution_assigned",
  COMMENT_ADDED: "activity.comment_added",
  JIRA_LINKED: "activity.jira_linked",
  ATTACHMENT_ADDED: "activity.attachment_added",
  SHARED_STEP_CREATED: "activity.shared_step_created",
  SHARED_STEP_UPDATED: "activity.shared_step_updated",
  WEBHOOK_CONFIGURED: "activity.webhook_configured",
  CUSTOM_FIELDS_UPDATED: "activity.custom_fields_updated",
};

export function ActivityFeed({ projectId, entityType, entityId, limit = 30 }: {
  projectId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}) {
  const { t } = useTranslation();
  const params: Record<string, string | number> = { limit };
  if (projectId) params.projectId = projectId;
  if (entityType) params.entityType = entityType;
  if (entityId) params.entityId = entityId;

  const { data: items = [] } = useQuery({
    queryKey: ["activity", params],
    queryFn: async () => (await api.get("/activity", { params })).data,
  });

  if (items.length === 0) return <div className="text-sm text-slate-500">{t("activity.none")}</div>;

  return (
    <ul className="space-y-2">
      {items.map((a: any) => (
        <li key={a.id} className="text-sm border-l-2 border-slate-200 dark:border-slate-700 pl-3">
          <div>
            <span className="font-medium">{a.user?.name ?? t("common.system")}</span>{" "}
            <span className="text-slate-600">{ACTION_KEYS[a.action] ? t(ACTION_KEYS[a.action]) : a.action}</span>
            {a.payload?.to && <span className="text-slate-700"> → <span className="font-medium">{a.payload.to}</span></span>}
            {a.payload?.issueKey && <span className="text-amber-700"> ({a.payload.issueKey})</span>}
          </div>
          <div className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</div>
        </li>
      ))}
    </ul>
  );
}

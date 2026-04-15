import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const ACTION_LABELS: Record<string, string> = {
  CASE_CREATED: "created case",
  CASE_UPDATED: "updated case",
  CASE_CLONED: "cloned case",
  RUN_CREATED: "created run",
  RUN_STATUS_CHANGED: "changed run status",
  EXECUTION_STATUS_CHANGED: "changed execution status",
  EXECUTION_ASSIGNED: "assigned execution",
  COMMENT_ADDED: "commented",
  JIRA_LINKED: "linked Jira issue",
  ATTACHMENT_ADDED: "added attachment",
};

export function ActivityFeed({ projectId, entityType, entityId, limit = 30 }: {
  projectId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}) {
  const params: Record<string, string | number> = { limit };
  if (projectId) params.projectId = projectId;
  if (entityType) params.entityType = entityType;
  if (entityId) params.entityId = entityId;

  const { data: items = [] } = useQuery({
    queryKey: ["activity", params],
    queryFn: async () => (await api.get("/activity", { params })).data,
  });

  if (items.length === 0) return <div className="text-sm text-slate-500">No activity yet.</div>;

  return (
    <ul className="space-y-2">
      {items.map((a: any) => (
        <li key={a.id} className="text-sm border-l-2 border-slate-200 dark:border-slate-700 pl-3">
          <div>
            <span className="font-medium">{a.user?.name ?? "System"}</span>{" "}
            <span className="text-slate-600">{ACTION_LABELS[a.action] ?? a.action}</span>
            {a.payload?.to && <span className="text-slate-700"> → <span className="font-medium">{a.payload.to}</span></span>}
            {a.payload?.issueKey && <span className="text-amber-700"> ({a.payload.issueKey})</span>}
          </div>
          <div className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</div>
        </li>
      ))}
    </ul>
  );
}

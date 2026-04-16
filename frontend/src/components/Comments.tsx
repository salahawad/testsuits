import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Target = { caseId?: string; executionId?: string; runId?: string };

export function Comments({ target }: { target: Target }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [body, setBody] = useState("");

  const key = ["comments", target];
  const { data: comments = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get("/comments", { params: target })).data,
  });

  const add = useMutation({
    mutationFn: async () => (await api.post("/comments", { ...target, body })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setBody("");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success(t("common.deleted"));
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) add.mutate();
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {comments.map((c: any) => (
          <li key={c.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {c.user.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{c.user.name}</span>
                <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                {(c.userId === user?.id || user?.role === "MANAGER") && (
                  <button className="text-slate-400 hover:text-red-600 ml-auto" onClick={() => remove.mutate(c.id)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</div>
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-slate-500">No comments yet.</li>}
      </ul>
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea className="input" rows={2} placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={add.isPending || !body.trim()}>Comment</button>
        </div>
      </form>
    </div>
  );
}

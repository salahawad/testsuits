import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Markdown } from "../lib/markdown";
import { RichEditor } from "./RichEditor";
import { Spinner } from "./Spinner";
import { logger } from "../lib/logger";
import { apiErrorMessage } from "../lib/apiError";

type SharedStep = {
  id: string;
  name: string;
  action: string;
  expected: string;
  createdBy?: { id: string; name: string } | null;
  updatedAt: string;
};

export function SharedStepsEditor({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [action, setAction] = useState("");
  const [expected, setExpected] = useState("");

  const { data: steps = [] } = useQuery<SharedStep[]>({
    queryKey: ["shared-steps", projectId],
    queryFn: async () => (await api.get("/shared-steps", { params: { projectId } })).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/shared-steps", { projectId, name, action, expected })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-steps", projectId] });
      setOpen(false);
      setName("");
      setAction("");
      setExpected("");
      toast.success(t("shared_steps.created"));
      logger.info("shared step created", { projectId });
    },
    onError: (e: any) => {
      const msg = apiErrorMessage(e, t("common.something_went_wrong"));
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/shared-steps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-steps", projectId] }),
    onError: (e: any) => toast.error(apiErrorMessage(e, t("common.something_went_wrong"))),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("shared_steps.validation.name_required"));
      return;
    }
    if (!action.trim()) {
      toast.error(t("shared_steps.validation.action_required"));
      return;
    }
    if (!expected.trim()) {
      toast.error(t("shared_steps.validation.expected_required"));
      return;
    }
    create.mutate();
  }

  return (
    <div className="card p-5 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t("shared_steps.title")}</h2>
          <p className="text-xs text-slate-500">{t("shared_steps.subtitle")}</p>
        </div>
        {canEdit && !open && (
          <button className="btn-secondary" onClick={() => setOpen(true)}><Plus size={14} /> {t("shared_steps.add")}</button>
        )}
      </header>

      {open && canEdit && (
        <form onSubmit={onSubmit} className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-3">
          <div>
            <label className="label">{t("shared_steps.name")}</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("cases.action")}</label>
              <RichEditor value={action} onChange={setAction} minHeight={88} />
            </div>
            <div>
              <label className="label">{t("cases.expected")}</label>
              <RichEditor value={expected} onChange={setExpected} minHeight={88} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{t("common.create")}</button>
          </div>
        </form>
      )}

      {steps.length === 0 && <div className="text-sm text-slate-500">{t("shared_steps.empty")}</div>}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {steps.map((s) => (
          <li key={s.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{s.name}</div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <div className="text-xs text-slate-500">{t("cases.action")}</div>
                    <Markdown source={s.action} className="text-sm" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{t("cases.expected")}</div>
                    <Markdown source={s.expected} className="text-sm" />
                  </div>
                </div>
              </div>
              {canEdit && (
                <button
                  className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                  disabled={remove.isPending && remove.variables === s.id}
                  onClick={() => { if (confirm(t("shared_steps.delete_confirm"))) remove.mutate(s.id); }}
                >
                  {remove.isPending && remove.variables === s.id
                    ? <Spinner size={16} className="text-red-600" />
                    : <Trash2 size={16} />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

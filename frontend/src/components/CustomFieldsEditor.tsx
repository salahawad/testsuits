import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { logger } from "../lib/logger";

type FieldType = "text" | "textarea" | "number" | "select" | "checkbox";
type CustomField = {
  id?: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
};

const FIELD_TYPES: FieldType[] = ["text", "textarea", "number", "select", "checkbox"];

export function CustomFieldsEditor({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data = [] } = useQuery<CustomField[]>({
    queryKey: ["custom-fields", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/custom-fields`)).data,
    enabled: !!projectId,
  });
  const [draft, setDraft] = useState<CustomField[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(data.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.put(`/projects/${projectId}/custom-fields`, draft)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-fields", projectId] });
      setErr(null);
      logger.info("custom fields saved", { projectId, count: draft.length });
    },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Save failed"),
  });

  function update(i: number, patch: Partial<CustomField>) {
    setDraft(draft.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    setDraft(draft.filter((_, idx) => idx !== i));
  }
  function add() {
    setDraft([...draft, { label: "", type: "text", required: false }]);
  }

  return (
    <div className="card p-5 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t("custom_fields.title")}</h2>
          <p className="text-xs text-slate-500">{t("custom_fields.subtitle")}</p>
        </div>
        {canEdit && <button className="btn-secondary" onClick={add}><Plus size={14} /> {t("custom_fields.add")}</button>}
      </header>

      {draft.length === 0 && <div className="text-sm text-slate-500">{t("custom_fields.empty")}</div>}

      <div className="space-y-3">
        {draft.map((f, i) => (
          <div key={i} className="border border-slate-200 rounded p-3 space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="label">{t("custom_fields.label")}</label>
                <input className="input" value={f.label} disabled={!canEdit}
                  onChange={(e) => update(i, { label: e.target.value })} />
              </div>
              <div>
                <label className="label">{t("custom_fields.type")}</label>
                <select className="input" value={f.type} disabled={!canEdit}
                  onChange={(e) => update(i, { type: e.target.value as FieldType })}>
                  {FIELD_TYPES.map((tp) => <option key={tp} value={tp}>{t(`custom_fields.type_${tp}`)}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={f.required} disabled={!canEdit}
                    onChange={(e) => update(i, { required: e.target.checked })} />
                  {t("custom_fields.required")}
                </label>
                {canEdit && (
                  <button className="text-slate-400 hover:text-red-600 ml-auto" onClick={() => remove(i)}><Trash2 size={16} /></button>
                )}
              </div>
            </div>
            {f.type === "select" && (
              <div>
                <label className="label">{t("custom_fields.options")}</label>
                <input className="input" placeholder={t("custom_fields.options_placeholder")}
                  value={(f.options ?? []).join(", ")} disabled={!canEdit}
                  onChange={(e) =>
                    update(i, {
                      options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  } />
              </div>
            )}
          </div>
        ))}
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {canEdit && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

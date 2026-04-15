import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, Plus, Trash2, Upload, Download, Copy, ExternalLink, GripVertical, BookOpen, X, Link2 } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../lib/api";
import { priorityColors } from "../lib/status";
import { Comments } from "../components/Comments";
import { Markdown } from "../lib/markdown";
import { RichEditor } from "../components/RichEditor";
import { logger } from "../lib/logger";

type Step = { action: string; expected: string; sharedStepId?: string | null };
type CustomField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox";
  required: boolean;
  options?: string[];
};
type SharedStep = { id: string; name: string; action: string; expected: string };

export function CaseDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const stepIdCounter = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function nextStepId() {
    stepIdCounter.current += 1;
    return `s-${stepIdCounter.current}`;
  }

  function onStepDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = stepIds.indexOf(String(active.id));
    const to = stepIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    setStepIds(arrayMove(stepIds, from, to));
    setDraft({ ...draft, steps: arrayMove(draft.steps, from, to) });
  }

  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: testCase, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: async () => (await api.get(`/cases/${id}`)).data,
    enabled: !!id,
  });

  const { data: revisions = [] } = useQuery({
    queryKey: ["case-revisions", id],
    queryFn: async () => (await api.get(`/cases/${id}/revisions`)).data,
    enabled: !!id && historyOpen,
  });

  const projectId = testCase?.suite?.project?.id;

  const { data: customFields = [] } = useQuery<CustomField[]>({
    queryKey: ["custom-fields", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/custom-fields`)).data,
    enabled: !!projectId,
  });

  const { data: sharedSteps = [] } = useQuery<SharedStep[]>({
    queryKey: ["shared-steps", projectId],
    queryFn: async () => (await api.get(`/shared-steps`, { params: { projectId } })).data,
    enabled: !!projectId && libraryOpen,
  });

  const save = useMutation({
    mutationFn: async () => (await api.patch(`/cases/${id}`, draft)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", id] });
      setEditing(false);
    },
  });

  const clone = useMutation({
    mutationFn: async () => (await api.post(`/cases/${id}/clone`, {})).data,
    onSuccess: (cloned) => navigate(`/cases/${cloned.id}`),
  });

  const remove = useMutation({
    mutationFn: async () => api.delete(`/cases/${id}`),
    onSuccess: () => {
      if (testCase?.suite?.id) navigate(`/suites/${testCase.suite.id}`);
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("caseId", id!);
      return (await api.post("/attachments", form)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case", id] }),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attId: string) => api.delete(`/attachments/${attId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case", id] }),
  });

  async function onDownload(attId: string) {
    const { data } = await api.get(`/attachments/${attId}/download`);
    window.open(data.url, "_blank");
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadAttachment.mutate(f);
    e.target.value = "";
  }

  function startEdit() {
    const initialSteps = [...(testCase.steps as Step[])];
    setDraft({
      title: testCase.title,
      preconditions: testCase.preconditions ?? "",
      priority: testCase.priority,
      tags: [...testCase.tags],
      steps: initialSteps,
      estimatedMinutes: testCase.estimatedMinutes ?? "",
      requirements: [...(testCase.requirements ?? [])],
      customFieldValues: { ...(testCase.customFieldValues ?? {}) },
    });
    setStepIds(initialSteps.map(() => nextStepId()));
    setEditing(true);
  }

  function insertSharedStep(s: SharedStep) {
    const newStep: Step = { action: s.action, expected: s.expected, sharedStepId: s.id };
    setDraft({ ...draft, steps: [...(draft?.steps ?? []), newStep] });
    setStepIds([...stepIds, nextStepId()]);
    setLibraryOpen(false);
    logger.info("shared step inserted", { sharedStepId: s.id, caseId: id });
  }

  function setCustomFieldValue(fieldId: string, value: unknown) {
    setDraft({
      ...draft,
      customFieldValues: { ...(draft.customFieldValues ?? {}), [fieldId]: value },
    });
  }

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (!testCase) return null;

  const steps: Step[] = (editing ? draft.steps : testCase.steps) as Step[];
  const reqs: string[] = editing ? draft.requirements : testCase.requirements ?? [];

  return (
    <div className="space-y-6">
      <Link to={`/suites/${testCase.suite.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-600">
        <ArrowLeft size={16} /> {testCase.suite.project.name} / {testCase.suite.name}
      </Link>

      {!editing ? (
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{testCase.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`badge ${priorityColors[testCase.priority]}`}>{testCase.priority}</span>
              {testCase.tags.map((t: string) => <span key={t} className="badge bg-slate-100 text-slate-700">{t}</span>)}
              {testCase.estimatedMinutes && <span className="badge bg-slate-100 text-slate-700">{testCase.estimatedMinutes} min</span>}
              {testCase.cloneOf && (
                <span className="badge bg-violet-100 text-violet-700">
                  <Link to={`/cases/${testCase.cloneOf.id}`} className="hover:underline">cloned from: {testCase.cloneOf.title}</Link>
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setHistoryOpen((v) => !v)}><Clock size={14} /> History</button>
            <button className="btn-secondary" onClick={() => clone.mutate()}><Copy size={14} /> Clone</button>
            <button className="btn-secondary" onClick={startEdit}>Edit</button>
            <button className="btn-secondary text-red-600" onClick={() => { if (confirm("Delete this case?")) remove.mutate(); }}>
              <Trash2 size={14} />
            </button>
          </div>
        </header>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="label">Estimated minutes</label>
              <input type="number" min={1} className="input" value={draft.estimatedMinutes}
                onChange={(e) => setDraft({ ...draft, estimatedMinutes: e.target.value ? parseInt(e.target.value, 10) : null })} />
            </div>
            <div>
              <label className="label">Tags (comma-separated)</label>
              <input className="input" value={draft.tags.join(", ")}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} />
            </div>
          </div>
          <div>
            <label className="label">Requirements (one per line — URL or ID)</label>
            <textarea className="input" rows={2} value={draft.requirements.join("\n")}
              onChange={(e) => setDraft({ ...draft, requirements: e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean) })} />
          </div>
        </div>
      )}

      {reqs.length > 0 && !editing && (
        <section className="card p-5">
          <h2 className="font-semibold mb-2">Requirements</h2>
          <ul className="space-y-1 text-sm">
            {reqs.map((r, i) => (
              <li key={i}>
                {/^https?:\/\//.test(r) ? (
                  <a href={r} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline inline-flex items-center gap-1">
                    {r} <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="text-slate-700">{r}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <LinkedRequirements
        caseId={testCase.id}
        projectId={testCase.suite.project.id}
        editing={editing}
        linked={testCase.requirementLinks ?? []}
      />


      <section className="card p-5">
        <h2 className="font-semibold mb-2">{t("cases.preconditions")}</h2>
        {!editing ? (
          testCase.preconditions
            ? <Markdown source={testCase.preconditions} className="text-sm text-slate-600" />
            : <p className="text-sm text-slate-600">—</p>
        ) : (
          <RichEditor
            value={draft.preconditions}
            onChange={(v) => setDraft({ ...draft, preconditions: v })}
            minHeight={80}
          />
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{t("cases.steps")}</h2>
          {editing && (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setLibraryOpen(true)}>
                <BookOpen size={14} /> {t("cases.shared_library")}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setDraft({ ...draft, steps: [...draft.steps, { action: "", expected: "" }] });
                  setStepIds([...stepIds, nextStepId()]);
                }}
              >
                <Plus size={14} /> {t("cases.step")}
              </button>
            </div>
          )}
        </div>
        {editing && (
          <p className="text-xs text-slate-500 mb-2">{t("cases.markdown_hint")}</p>
        )}
        {steps.length === 0 ? (
          <div className="text-sm text-slate-500">No steps defined.</div>
        ) : editing ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStepDragEnd}>
            <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
              <ol className="space-y-3">
                {steps.map((s, i) => (
                  <SortableStepRow
                    key={stepIds[i] ?? `fallback-${i}`}
                    id={stepIds[i] ?? `fallback-${i}`}
                    index={i}
                    step={s}
                    onChangeAction={(v) => setDraft({ ...draft, steps: draft.steps.map((x: Step, idx: number) => idx === i ? { ...x, action: v } : x) })}
                    onChangeExpected={(v) => setDraft({ ...draft, steps: draft.steps.map((x: Step, idx: number) => idx === i ? { ...x, expected: v } : x) })}
                    onDelete={() => {
                      setDraft({ ...draft, steps: draft.steps.filter((_: Step, idx: number) => idx !== i) });
                      setStepIds(stepIds.filter((_, idx) => idx !== i));
                    }}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                      {t("cases.action")}
                      {s.sharedStepId && (
                        <span className="badge bg-violet-100 text-violet-700 text-[10px]" title={t("cases.linked_shared_step")}>
                          <Link2 size={10} /> {t("cases.shared")}
                        </span>
                      )}
                    </div>
                    <Markdown source={s.action} className="text-sm" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">{t("cases.expected")}</div>
                    <Markdown source={s.expected} className="text-sm" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {customFields.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-3">{t("cases.custom_fields")}</h2>
          {!editing ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {customFields.map((f) => {
                const v = testCase.customFieldValues?.[f.id];
                const display =
                  f.type === "checkbox"
                    ? v
                      ? t("common.yes")
                      : t("common.no")
                    : v == null || v === ""
                      ? "—"
                      : String(v);
                return (
                  <div key={f.id} className="flex flex-col">
                    <dt className="text-xs text-slate-500">{f.label}</dt>
                    <dd className="text-slate-700">{display}</dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {customFields.map((f) => {
                const v = draft.customFieldValues?.[f.id];
                const common = { required: f.required };
                return (
                  <div key={f.id}>
                    <label className="label">
                      {f.label}
                      {f.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {f.type === "text" && (
                      <input className="input" value={v ?? ""} {...common}
                        onChange={(e) => setCustomFieldValue(f.id, e.target.value)} />
                    )}
                    {f.type === "textarea" && (
                      <textarea className="input" rows={3} value={v ?? ""} {...common}
                        onChange={(e) => setCustomFieldValue(f.id, e.target.value)} />
                    )}
                    {f.type === "number" && (
                      <input type="number" className="input" value={v ?? ""} {...common}
                        onChange={(e) => setCustomFieldValue(f.id, e.target.value === "" ? null : Number(e.target.value))} />
                    )}
                    {f.type === "select" && (
                      <select className="input" value={(v as string) ?? ""} {...common}
                        onChange={(e) => setCustomFieldValue(f.id, e.target.value || null)}>
                        <option value="">—</option>
                        {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {f.type === "checkbox" && (
                      <label className="flex items-center gap-2 text-sm mt-1">
                        <input type="checkbox" checked={!!v}
                          onChange={(e) => setCustomFieldValue(f.id, e.target.checked)} />
                        {f.label}
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {libraryOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-center justify-center p-4" onClick={() => setLibraryOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-semibold">{t("cases.shared_library")}</h3>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => setLibraryOpen(false)}><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2">
              {sharedSteps.length === 0 && <div className="text-sm text-slate-500">{t("cases.no_shared_steps")}</div>}
              {sharedSteps.map((s) => (
                <button key={s.id} className="w-full text-left border border-slate-200 hover:border-brand-400 rounded-md p-3" onClick={() => insertSharedStep(s)}>
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{s.action}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>Save</button>
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Attachments</h2>
          <label className="btn-secondary cursor-pointer">
            <Upload size={14} /> Upload
            <input type="file" className="hidden" onChange={onFile} />
          </label>
        </div>
        {testCase.attachments.length === 0 ? (
          <div className="text-sm text-slate-500">No attachments yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {testCase.attachments.map((a: any) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">{a.filename}</div>
                  <div className="text-xs text-slate-500">{(a.size / 1024).toFixed(1)} KB · by {a.uploadedBy.name}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => onDownload(a.id)}><Download size={14} /></button>
                  <button className="btn-secondary text-red-600" onClick={() => deleteAttachment.mutate(a.id)}><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historyOpen && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">History</h2>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setHistoryOpen(false)}><X size={16} /></button>
          </div>
          {(revisions as any[]).length === 0 ? (
            <div className="text-sm text-slate-500">No prior revisions.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(revisions as any[]).map((r) => (
                <li key={r.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">v{r.version} — {r.title}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleString()}
                      {r.author && <> · {r.author.name}</>}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    priority: {r.priority} · {Array.isArray(r.steps) ? r.steps.length : 0} step(s) · tags: {(r.tags ?? []).join(", ") || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Discussion</h2>
        <Comments target={{ caseId: testCase.id }} />
      </section>
    </div>
  );
}

function SortableStepRow({
  id,
  index,
  step,
  onChangeAction,
  onChangeExpected,
  onDelete,
}: {
  id: string;
  index: number;
  step: Step;
  onChangeAction: (v: string) => void;
  onChangeExpected: (v: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex gap-3 items-start bg-white ${isDragging ? "shadow-lg ring-1 ring-brand-200 rounded-md" : ""}`}
    >
      <button
        type="button"
        aria-label={`Reorder step ${index + 1}`}
        className="mt-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 grid grid-cols-2 gap-3">
        <RichEditor value={step.action} onChange={onChangeAction} placeholder="Action" minHeight={64} />
        <RichEditor value={step.expected} onChange={onChangeExpected} placeholder="Expected result" minHeight={64} />
      </div>
      <button className="text-slate-400 hover:text-red-600 mt-1" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </li>
  );
}

type LinkedReq = { id: string; externalRef: string; title: string };

function LinkedRequirements({
  caseId,
  projectId,
  editing,
  linked,
}: {
  caseId: string;
  projectId: string;
  editing: boolean;
  linked: LinkedReq[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pickId, setPickId] = useState("");

  const { data: allReqs = [] } = useQuery<LinkedReq[]>({
    queryKey: ["requirements", projectId],
    queryFn: async () => (await api.get(`/requirements`, { params: { projectId } })).data,
    enabled: !!projectId && editing,
  });

  const link = useMutation({
    mutationFn: async (reqId: string) => api.post(`/requirements/${reqId}/cases`, { caseId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["requirements", projectId] });
      setPickId("");
    },
  });

  const unlink = useMutation({
    mutationFn: async (reqId: string) => api.delete(`/requirements/${reqId}/cases/${caseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["requirements", projectId] });
    },
  });

  const linkedIds = new Set(linked.map((r) => r.id));
  const pickable = allReqs.filter((r) => !linkedIds.has(r.id));

  if (!editing && linked.length === 0) return null;

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Link2 size={16} /> {t("requirements.linked_cases") /* reuse label */ ?? "Linked requirements"}
        </h2>
        <Link to={`/projects/${projectId}/requirements`} className="text-xs text-brand-600 hover:underline">
          {t("requirements.title")}
        </Link>
      </div>
      {linked.length === 0 ? (
        <div className="text-sm text-slate-500">{t("requirements.empty")}</div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {linked.map((r) => (
            <li key={r.id} className="badge bg-brand-50 text-brand-700 flex items-center gap-1">
              {/^https?:\/\//.test(r.externalRef) ? (
                <a href={r.externalRef} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1 font-mono">
                  {r.externalRef} <ExternalLink size={10} />
                </a>
              ) : (
                <span className="font-mono">{r.externalRef}</span>
              )}
              <span className="text-slate-700">· {r.title}</span>
              {editing && (
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => unlink.mutate(r.id)}
                  aria-label="Unlink"
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && pickable.length > 0 && (
        <div className="flex items-center gap-2">
          <select className="input flex-1" value={pickId} onChange={(e) => setPickId(e.target.value)}>
            <option value="">{t("requirements.pick_for_case")}</option>
            {pickable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.externalRef} — {r.title}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary"
            disabled={!pickId || link.isPending}
            onClick={() => pickId && link.mutate(pickId)}
          >
            <Plus size={14} /> {t("common.create")}
          </button>
        </div>
      )}
    </section>
  );
}

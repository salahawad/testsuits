import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Upload, Download, Copy, ExternalLink, GripVertical } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
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

type Step = { action: string; expected: string };

export function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [stepIds, setStepIds] = useState<string[]>([]);
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

  const { data: testCase, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: async () => (await api.get(`/cases/${id}`)).data,
    enabled: !!id,
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
    });
    setStepIds(initialSteps.map(() => nextStepId()));
    setEditing(true);
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

      <section className="card p-5">
        <h2 className="font-semibold mb-2">Preconditions</h2>
        {!editing ? (
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{testCase.preconditions || "—"}</p>
        ) : (
          <textarea className="input" rows={3} value={draft.preconditions} onChange={(e) => setDraft({ ...draft, preconditions: e.target.value })} />
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Steps</h2>
          {editing && (
            <button
              className="btn-secondary"
              onClick={() => {
                setDraft({ ...draft, steps: [...draft.steps, { action: "", expected: "" }] });
                setStepIds([...stepIds, nextStepId()]);
              }}
            >
              <Plus size={14} /> Step
            </button>
          )}
        </div>
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
                    <div className="text-xs text-slate-500 mb-0.5">Action</div>
                    <div className="text-sm">{s.action}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Expected</div>
                    <div className="text-sm">{s.expected}</div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

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
        <textarea
          className="input"
          rows={2}
          placeholder="Action"
          value={step.action}
          onChange={(e) => onChangeAction(e.target.value)}
        />
        <textarea
          className="input"
          rows={2}
          placeholder="Expected result"
          value={step.expected}
          onChange={(e) => onChangeExpected(e.target.value)}
        />
      </div>
      <button className="text-slate-400 hover:text-red-600 mt-1" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </li>
  );
}

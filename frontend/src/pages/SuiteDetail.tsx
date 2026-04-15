import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FolderTree, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { priorityColors } from "../lib/status";

export function SuiteDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const [openSuite, setOpenSuite] = useState(false);
  const [openCase, setOpenCase] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [casePriority, setCasePriority] = useState("MEDIUM");

  const { data: suite, isLoading } = useQuery({
    queryKey: ["suite", id],
    queryFn: async () => (await api.get(`/suites/${id}`)).data,
    enabled: !!id,
  });

  const createSuite = useMutation({
    mutationFn: async () => (await api.post("/suites", { projectId: suite.projectId, parentId: id, name: suiteName })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suite", id] });
      setOpenSuite(false);
      setSuiteName("");
    },
  });

  const createCase = useMutation({
    mutationFn: async () =>
      (await api.post("/cases", { suiteId: id, title: caseTitle, priority: casePriority })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suite", id] });
      setOpenCase(false);
      setCaseTitle("");
    },
  });

  if (isLoading) return <div className="text-slate-500">{t("common.loading")}</div>;
  if (!suite) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link to={`/projects/${suite.project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-600">
          <ArrowLeft size={16} /> {suite.project.name}
        </Link>
        <h1 className="text-2xl font-bold">{suite.name}</h1>
        {suite.description && <p className="text-sm text-slate-500 mt-1">{suite.description}</p>}
      </header>

      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => setOpenSuite(true)}><Plus size={16} /> {t("suites.sub_suite")}</button>
        <button className="btn-primary" onClick={() => setOpenCase(true)}><Plus size={16} /> {t("suites.test_case")}</button>
      </div>

      {openSuite && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createSuite.mutate(); }} className="card p-5 space-y-3">
          <div>
            <label className="label">{t("projects.suite_name")}</label>
            <input className="input" value={suiteName} onChange={(e) => setSuiteName(e.target.value)} required />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpenSuite(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary">{t("common.create")}</button>
          </div>
        </form>
      )}

      {openCase && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createCase.mutate(); }} className="card p-5 space-y-3">
          <div>
            <label className="label">{t("suites.case_title")}</label>
            <input className="input" value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("suites.priority")}</label>
            <select className="input" value={casePriority} onChange={(e) => setCasePriority(e.target.value)}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpenCase(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary">{t("common.create")}</button>
          </div>
        </form>
      )}

      {suite.children.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">{t("suites.sub_suites")}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {suite.children.map((c: any) => (
              <Link key={c.id} to={`/suites/${c.id}`} className="card p-4 hover:border-brand-500 flex items-center gap-3">
                <FolderTree size={20} className="text-brand-600" />
                <div className="flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">{t("projects.suites_count", { count: c._count.cases })}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">{t("suites.test_cases")}</h2>
        {suite.cases.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">{t("suites.no_cases")}</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {suite.cases.map((c: any) => (
              <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div className="flex-1">
                  <div className="font-medium">{c.title}</div>
                  {c.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {c.tags.map((t: string) => <span key={t} className="badge bg-slate-100 text-slate-700">{t}</span>)}
                    </div>
                  )}
                </div>
                <span className={`badge ${priorityColors[c.priority]}`}>{c.priority}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Small breadcrumb-style link rendered above the title, e.g. "← ProjectName". */
  breadcrumb?: ReactNode;
  /** An optional eyebrow label (e.g. project key in uppercase). */
  eyebrow?: ReactNode;
};

/**
 * Standard top-of-page header — title + optional subtitle on the left, action
 * buttons on the right. Used to be copy-pasted on every page; centralise the
 * spacing + typography here so the product feels consistent.
 */
export function PageHeader({ title, subtitle, actions, breadcrumb, eyebrow }: Props) {
  return (
    <div className="space-y-2">
      {breadcrumb}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-xs font-semibold text-brand-600 mb-1">{eyebrow}</div>
          )}
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </header>
    </div>
  );
}

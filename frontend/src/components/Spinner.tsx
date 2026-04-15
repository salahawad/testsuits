import { useTranslation } from "react-i18next";

type Props = {
  size?: number;
  /** Applied to the SVG. Use `currentColor` friendly classes (e.g. text-brand-600). */
  className?: string;
  /** For screen readers. Defaults to translated "Loading…". */
  label?: string;
};

/**
 * Tiny inline spinner. Uses `currentColor` so callers can tint it with a
 * Tailwind text-* class. Marked `aria-hidden` when we expose a label elsewhere
 * (e.g. a button that already says "Saving…").
 */
export function Spinner({ size = 16, className, label }: Props) {
  const { t } = useTranslation();
  const srLabel = label ?? t("common.loading");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className ?? ""}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={srLabel}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Full-card / full-page loader — a centred spinner with an optional label.
 * Use it anywhere the old `<div>t("common.loading")</div>` used to sit.
 */
export function PageLoader({ label, minHeight = 200 }: { label?: string; minHeight?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center text-slate-500 gap-2"
      style={{ minHeight }}
    >
      <Spinner size={28} className="text-brand-600" label={label ?? t("common.loading")} />
      <span className="text-sm">{label ?? t("common.loading")}</span>
    </div>
  );
}

/**
 * Inline loader for small surfaces (dropdown bodies, narrow rows).
 */
export function InlineLoader({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 py-2 px-1">
      <Spinner size={14} className="text-slate-400" />
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}

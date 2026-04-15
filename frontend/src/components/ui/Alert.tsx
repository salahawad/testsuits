import { HTMLAttributes, ReactNode } from "react";

type Tone = "error" | "warning" | "info" | "success";

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
};

const tones: Record<Tone, string> = {
  error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200",
  warning: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200",
  info: "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-200",
  success: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200",
};

const roles: Record<Tone, "alert" | "status"> = {
  error: "alert",
  warning: "alert",
  info: "status",
  success: "status",
};

/**
 * Inline message banner for form errors and transient warnings. Replaces
 * the ad-hoc `<div className="text-sm text-red-600">{err}</div>` pattern.
 */
export function Alert({ tone = "error", title, children, className, ...rest }: Props) {
  return (
    <div
      role={roles[tone]}
      className={`rounded-md border text-sm p-3 ${tones[tone]} ${className ?? ""}`.trim()}
      {...rest}
    >
      {title && <div className="font-semibold mb-0.5">{title}</div>}
      {children}
    </div>
  );
}

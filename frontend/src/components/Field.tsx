import { ReactNode, cloneElement, isValidElement, ReactElement } from "react";
import clsx from "clsx";

type Props = {
  name: string;
  label?: ReactNode;
  description?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared form field primitive. Wraps a label, the control, an optional
 * description, and an error message, and wires the aria plumbing so screen
 * readers announce the error when the field becomes invalid.
 *
 * Pass a single input-like child (input, select, textarea, or a custom
 * component that forwards id/aria-*). We'll inject the right ids and aria
 * attributes so callers don't have to duplicate them.
 */
export function Field({ name, label, description, error, className, children }: Props) {
  const errorId = error ? `${name}-error` : undefined;
  const descId = description ? `${name}-desc` : undefined;
  const describedBy = [descId, errorId].filter(Boolean).join(" ") || undefined;

  const enhanced = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className={clsx("space-y-1", className)}>
      {label && (
        <label className="label" htmlFor={name}>
          {label}
        </label>
      )}
      {enhanced}
      {description && !error && (
        <p id={descId} className="text-xs text-slate-500">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { Spinner } from "../Spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button. Prefer over `disabled` for
   * mutation-triggered buttons so the spinner state stays in sync. */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Make the button fill its container. */
  block?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 focus-visible:ring-brand-500",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 focus-visible:ring-brand-500",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:ring-brand-500",
};

const spinnerTone: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-slate-600",
  danger: "text-white",
  ghost: "text-slate-600",
};

/**
 * Standard button used across the app. Replaces the old `className="btn-*"`
 * classes — those still exist in index.css for legacy callers during the
 * migration but new code should use this component.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", loading = false, leftIcon, rightIcon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${block ? "w-full" : ""} ${className ?? ""}`.trim()}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "sm" ? 12 : 14} className={spinnerTone[variant]} />
      ) : (
        leftIcon
      )}
      {children}
      {rightIcon}
    </button>
  );
});

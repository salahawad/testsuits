import { useTranslation } from "react-i18next";

type Props = {
  size?: number;
  /** Show the wordmark next to the icon. */
  withWordmark?: boolean;
  /** Tailwind classes applied to the wordmark text. */
  textClassName?: string;
  className?: string;
};

/**
 * TestSuits mark — a stacked card with a checkmark. The back card hints at
 * multiple suites; the foreground tile carries the verification tick. Colors
 * are pinned to the `brand` palette in tailwind.config.js so the icon stays
 * in sync with the rest of the UI.
 */
export function Logo({ size = 28, withWordmark = false, textClassName, className }: Props) {
  const { t } = useTranslation();
  const title = t("app.name");
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ts-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f6bf6" />
            <stop offset="1" stopColor="#3b54d9" />
          </linearGradient>
        </defs>
        {/* Back tile — a second suite peeking out */}
        <rect x="12" y="4" width="28" height="28" rx="6" fill="#dbe6ff" />
        {/* Foreground tile — brand gradient */}
        <rect x="6" y="12" width="32" height="32" rx="7" fill="url(#ts-logo-g)" />
        {/* Checkmark */}
        <path
          d="M13.5 28 L20 34 L31 20"
          stroke="white"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {withWordmark && (
        <span className={textClassName ?? "text-lg font-bold tracking-tight text-brand-600"}>
          {title}
        </span>
      )}
    </span>
  );
}

import clsx from "clsx";
import { api } from "../lib/api";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

type Props = {
  userId: string;
  name: string;
  hasAvatar?: boolean;
  /** Tailwind size classes, e.g. "w-8 h-8" (default) or "w-16 h-16". */
  size?: string;
  className?: string;
};

export function UserAvatar({ userId, name, hasAvatar, size = "w-8 h-8", className }: Props) {
  const src = hasAvatar ? `${api.defaults.baseURL}/users/${userId}/avatar` : null;

  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden",
        "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 font-medium",
        size,
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fall back to initials if the image fails to load.
            const el = e.currentTarget;
            el.style.display = "none";
            el.parentElement!.dataset.fallback = "1";
          }}
        />
      ) : null}
      <span className={clsx("select-none text-[0.45em] leading-none", src && "hidden")} aria-hidden>
        {initials(name)}
      </span>
    </span>
  );
}

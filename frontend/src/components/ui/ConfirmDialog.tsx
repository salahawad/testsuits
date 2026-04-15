import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

type Tone = "danger" | "warning" | "neutral";

type Options = {
  title?: ReactNode;
  body?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: Tone;
};

type Ctx = {
  confirm: (opts?: Options) => Promise<boolean>;
};

const ConfirmContext = createContext<Ctx | null>(null);

type PendingRequest = {
  opts: Options;
  resolve: (value: boolean) => void;
};

/**
 * Mount this once near the root of the app. Child components call
 * `useConfirm()` to open a styled, keyboard-accessible confirm dialog and
 * `await` the user's decision.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: Options = {}) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((p) => {
      p?.resolve(result);
      return null;
    });
  }, []);

  // Focus the confirm button and trap Esc to cancel.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <Dialog
          opts={pending.opts}
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
          confirmBtnRef={confirmBtnRef}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function Dialog({
  opts,
  onCancel,
  onConfirm,
  confirmBtnRef,
}: {
  opts: Options;
  onCancel: () => void;
  onConfirm: () => void;
  confirmBtnRef: React.RefObject<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const tone: Tone = opts.tone ?? "danger";
  const confirmVariant = tone === "danger" ? "danger" : tone === "warning" ? "primary" : "primary";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-900 dark:border dark:border-slate-800 rounded-lg shadow-xl max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {tone !== "neutral" && (
            <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${tone === "danger" ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}>
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 id="confirm-dialog-title" className="font-semibold text-slate-900 dark:text-slate-100">
              {opts.title ?? t("confirm.default_title")}
            </h2>
            {opts.body && <div className="text-sm text-slate-600 mt-1">{opts.body}</div>}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            {opts.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            ref={confirmBtnRef}
            variant={confirmVariant}
            onClick={onConfirm}
          >
            {opts.confirmLabel ?? t("confirm.default_confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Opens a confirm dialog and resolves with the user's choice. Replaces
 * `window.confirm()` — styled, translatable, keyboard-accessible, and
 * doesn't block the event loop.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete foo?", tone: "danger" })) {
 *     remove.mutate();
 *   }
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm() must be used inside <ConfirmProvider>");
  }
  return ctx.confirm;
}

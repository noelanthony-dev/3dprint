import { useEffect } from "react";

export type ToastTone = "success" | "warning" | "danger";

export interface ToastMessage {
  readonly id: number;
  readonly message: string;
  readonly title: string;
  readonly tone: ToastTone;
}

interface ToastProps {
  readonly onDismiss: () => void;
  readonly toast: ToastMessage | null;
}

export function Toast({ onDismiss, toast }: ToastProps) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(onDismiss, 4_000);

    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast]);

  if (!toast) {
    return null;
  }

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      <div className="toast" data-tone={toast.tone} role={toast.tone === "danger" ? "alert" : "status"}>
        <div>
          <strong>{toast.title}</strong>
          <p>{toast.message}</p>
        </div>
        <button aria-label="Dismiss notification" onClick={onDismiss} type="button">
          x
        </button>
      </div>
    </div>
  );
}

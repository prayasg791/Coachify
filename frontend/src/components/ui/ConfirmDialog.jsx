import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button.jsx";

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", onConfirm, onCancel, danger = false, loading = false }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-floating">
        <div className="flex items-start justify-between">
          <span className={`grid size-10 place-items-center rounded-lg ${danger ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}><AlertTriangle aria-hidden="true" size={19} /></span>
          <button type="button" aria-label="Close dialog" onClick={onCancel} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <h2 id="confirm-title" className="mt-4 font-display text-lg font-bold text-slate-900">{title}</h2>
        <p id="confirm-description" className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}

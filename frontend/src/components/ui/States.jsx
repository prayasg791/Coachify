import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "./Button.jsx";

export function LoadingState({ label = "Loading" }) {
  return (
    <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <LoaderCircle aria-hidden="true" className="animate-spin text-brand-600" size={24} />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", description, action }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><Inbox aria-hidden="true" size={21} /></span>
      <h3 className="font-display text-base font-bold text-slate-800">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "We couldn’t load this", description, onRetry }) {
  return (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-xl bg-rose-50 text-rose-600"><AlertCircle aria-hidden="true" size={21} /></span>
      <h3 className="font-display text-base font-bold text-slate-800">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

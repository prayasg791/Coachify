export function Input({ label, id, hint, error, className = "", ...props }) {
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>}
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`min-h-11 w-full rounded-lg border bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 ${error ? "border-rose-300" : "border-slate-200"} ${className}`}
        {...props}
      />
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">{error}</p>}
      {!error && hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Select({ label, id, children, className = "", ...props }) {
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>}
      <select
        id={id}
        className={`min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

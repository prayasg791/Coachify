export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-brand-600">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

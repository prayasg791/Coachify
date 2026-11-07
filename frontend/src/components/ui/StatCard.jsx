export function StatCard({ label, value, note, icon: Icon, tone = "brand" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <span className={`grid size-9 place-items-center rounded-lg ${tones[tone]}`}><Icon aria-hidden="true" size={17} /></span>}
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </article>
  );
}

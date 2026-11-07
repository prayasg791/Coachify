const styles = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-brand-50 text-brand-700",
};

export function Badge({ tone = "neutral", children, className = "" }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${styles[tone]} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  const normalized = String(status ?? "").toLowerCase();
  const tone = ["paid", "active", "completed", "approved"].includes(normalized)
    ? "success"
    : ["pending", "due", "in progress"].includes(normalized)
      ? "warning"
      : ["overdue", "failed", "rejected"].includes(normalized)
        ? "danger"
        : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

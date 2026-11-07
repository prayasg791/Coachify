import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarClock, ChevronLeft, ChevronRight, Clock3, FilterX, MessageSquareText } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useParentStudentsOptional } from "../auth/ParentStudentsContext.jsx";
import { getAccountsReminders, getParentReminders } from "../auth/api.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { Select } from "../components/ui/Select.jsx";

const PAGE_SIZE = 10;
const reminderTypes = [
  ["BEFORE_7_DAYS", "7 days before"],
  ["BEFORE_3_DAYS", "3 days before"],
  ["DUE_TODAY", "Due today"],
  ["OVERDUE", "Overdue"],
  ["FOLLOW_UP", "Follow-up"],
];
const reminderStatuses = [
  ["SCHEDULED", "Scheduled"],
  ["PROCESSING", "Processing"],
  ["SENT", "Sent"],
  ["CANCELLED", "Cancelled"],
  ["FAILED", "Failed"],
];
const statusTone = {
  SCHEDULED: "info",
  PROCESSING: "warning",
  SENT: "success",
  CANCELLED: "neutral",
  FAILED: "danger",
};
const typeLabel = (value) => reminderTypes.find(([key]) => key === value)?.[1] ?? value ?? "Reminder";
const statusLabel = (value) => reminderStatuses.find(([key]) => key === value)?.[1] ?? value ?? "Unknown";
const formatDateTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(date);
};
const formatDueDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeZone: "Asia/Kolkata",
    }).format(date);
};
const formatAmount = (paise) => typeof paise === "number" && Number.isFinite(paise)
  ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100)
  : "Not available";

function ReminderFilters({ accounts = false, centres = [], filters, setFilters, onApply, onClear, loading }) {
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <form onSubmit={onApply} className="mb-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {accounts && (
          <Select id="reminder-centre-filter" label="Centre" value={filters.centreId} onChange={(event) => update("centreId", event.target.value)}>
            <option value="">All assigned centres</option>
            {centres.map((centreId) => <option key={centreId} value={centreId}>Centre · {centreId}</option>)}
          </Select>
        )}
        <Select id="reminder-status-filter" label="Delivery status" value={filters.status} onChange={(event) => update("status", event.target.value)}>
          <option value="">All statuses</option>
          {reminderStatuses.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
        </Select>
        <Select id="reminder-type-filter" label="Reminder type" value={filters.type} onChange={(event) => update("type", event.target.value)}>
          <option value="">All reminder types</option>
          {reminderTypes.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </Select>
        <div>
          <label htmlFor="reminder-start-date" className="mb-1.5 block text-sm font-semibold text-slate-700">Scheduled from</label>
          <input id="reminder-start-date" type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" />
        </div>
        <div>
          <label htmlFor="reminder-end-date" className="mb-1.5 block text-sm font-semibold text-slate-700">Scheduled through</label>
          <input id="reminder-end-date" type="date" min={filters.startDate || undefined} value={filters.endDate} onChange={(event) => update("endDate", event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" />
        </div>
        <Select id="reminder-page-size" label="Results per page" value={filters.limit} onChange={(event) => update("limit", event.target.value)}>
          {[10, 20, 50, 100].map((limit) => <option key={limit} value={String(limit)}>{limit}</option>)}
        </Select>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={loading} loading={loading}><FilterX size={15} />Apply filters</Button>
        <Button type="button" variant="secondary" disabled={loading} onClick={onClear}>Clear filters</Button>
      </div>
    </form>
  );
}

function ReminderCard({ reminder, accounts = false, centreId }) {
  const language = reminder.language === "HINDI" ? "हिन्दी · Hindi" : "English";
  return (
    <article className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Bell size={18} /></span>
          <div className="min-w-0">
            <h2 className="break-words font-display text-base font-bold text-slate-900">{reminder.student?.name ?? "Student unavailable"}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Student ID {reminder.student?.studentId ?? "Not available"}</p>
          </div>
        </div>
        <Badge tone={statusTone[reminder.status] ?? "neutral"}>{statusLabel(reminder.status)}</Badge>
      </div>

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Reminder</p><p className="mt-1 text-sm font-semibold text-slate-800">{typeLabel(reminder.type)}</p></div>
        <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Language</p><p lang={reminder.language === "HINDI" ? "hi" : "en"} className="mt-1 text-sm font-semibold text-slate-800">{language}</p></div>
        <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Instalment</p><p className="mt-1 text-sm font-semibold text-slate-800">#{reminder.instalment?.number ?? "—"} · Due {formatDueDate(reminder.instalment?.dueDate)}</p></div>
        <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Current outstanding</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{formatAmount(reminder.outstandingBalancePaise)}</p></div>
        {accounts && <div className="sm:col-span-2"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Centre</p><p className="mt-1 break-all text-xs font-medium text-slate-700">{centreId ? `Centre ID ${centreId}` : "Centre not returned by the reminder API"}</p></div>}
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3.5 sm:p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><MessageSquareText size={14} />Message</div>
        <p lang={reminder.language === "HINDI" ? "hi" : "en"} className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reminder.message || "No message content returned"}</p>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <p className="flex min-w-0 items-start gap-2 text-slate-600"><CalendarClock size={15} className="mt-0.5 shrink-0 text-brand-600" /><span><strong className="font-semibold text-slate-700">Scheduled:</strong> {formatDateTime(reminder.scheduledAt)}</span></p>
        <p className="flex min-w-0 items-start gap-2 text-slate-600"><Clock3 size={15} className="mt-0.5 shrink-0 text-brand-600" /><span><strong className="font-semibold text-slate-700">Sent:</strong> {reminder.sentAt ? formatDateTime(reminder.sentAt) : "Not sent"}</span></p>
      </div>
    </article>
  );
}

function ReminderList({ role }) {
  const { accessToken, user } = useAuth();
  const parentContext = useParentStudentsOptional();
  const students = parentContext?.students ?? [];
  const selectedStudent = parentContext?.selectedStudent ?? null;
  const studentsStatus = parentContext?.status ?? "empty";
  const isParent = role === "PARENT";
  const centres = useMemo(() => [...new Set((user?.centres ?? []).map((item) => String(item?._id ?? item)))], [user?.centres]);
  const emptyFilters = { centreId: "", status: "", type: "", startDate: "", endDate: "", limit: String(PAGE_SIZE) };
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [reminders, setReminders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isParent && (studentsStatus !== "ready" || !selectedStudent)) {
      setReminders([]);
      setPagination(null);
      setState("idle");
      return undefined;
    }
    const controller = new AbortController();
    setState("loading");
    setReminders([]);
    setPagination(null);
    setError("");
    const requestFilters = {
      ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)),
      page: String(page),
    };
    const getReminders = isParent ? getParentReminders : getAccountsReminders;
    getReminders({ filters: requestFilters, accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data) || !response.pagination) {
          throw new Error("The reminder API returned an unexpected response.");
        }
        const knownStudents = new Set(students.map((student) => student.id));
        const visibleRows = isParent
          ? response.data.filter((reminder) => knownStudents.has(reminder.student?.id))
          : response.data;
        setReminders(visibleRows);
        setPagination(response.pagination);
        setState("success");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(requestError.response?.data?.message || requestError.message || "Please try again in a moment.");
        setState("error");
      });
    return () => controller.abort();
  }, [accessToken, isParent, studentsStatus, selectedStudent?.id, students, appliedFilters, page, retry]);

  const apply = (event) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters });
  };
  const clear = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };
  const totalPages = pagination?.totalPages || 1;
  const displayCentreId = centres.length === 1 ? centres[0] : "";

  return (
    <>
      <PageHeader
        eyebrow={isParent ? "Parent portal" : "Accounts"}
        title={isParent ? "Notifications" : "Reminder history"}
        description={isParent
          ? "Review reminder messages and delivery status for your linked children. The list includes all linked children with active consent."
          : "Review scheduled and sent reminder records across your assigned centres."}
      />
      {import.meta.env.DEV && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
          Demo messaging only: reminder delivery is simulated in development. No SMS or WhatsApp messages are sent.
        </p>
      )}
      {isParent && selectedStudent && students.length > 1 && (
        <p className="mb-4 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5 text-xs leading-5 text-brand-800">
          Selected student: <strong>{selectedStudent.name} · {selectedStudent.studentId}</strong>. Reminder history below includes all linked children because the API returns the parent’s combined history.
        </p>
      )}
      {isParent && studentsStatus === "ready" && selectedStudent && (
        <ReminderFilters filters={filters} setFilters={setFilters} onApply={apply} onClear={clear} loading={state === "loading"} />
      )}
      {!isParent && (
        <ReminderFilters accounts centres={centres} filters={filters} setFilters={setFilters} onApply={apply} onClear={clear} loading={state === "loading"} />
      )}

      {state === "idle" && isParent && studentsStatus === "ready" && !selectedStudent && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="Choose a student to open notifications" description="Select one of your linked children above. The returned reminder history will include all linked children." /></section>
      )}
      {state === "idle" && isParent && studentsStatus === "empty" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No eligible students found" description="The institute may need to verify the parent account or active consent." /></section>
      )}
      {state === "loading" && <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><LoadingState label="Loading reminder history" /></section>}
      {state === "error" && <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><ErrorState title="Couldn’t load reminder history" description={error} onRetry={() => setRetry((value) => value + 1)} /></section>}
      {state === "success" && reminders.length === 0 && <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No reminder records found" description="There are no reminder records for the selected filters and page." /></section>}
      {state === "success" && reminders.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{pagination.totalRecords} reminder{pagination.totalRecords === 1 ? "" : "s"}</span>
            <span>Page {pagination.currentPage} of {totalPages}</span>
          </div>
          <div className="space-y-3">
            {reminders.map((reminder) => <ReminderCard key={reminder.id} reminder={reminder} accounts={!isParent} centreId={displayCentreId} />)}
          </div>
          <nav aria-label="Reminder pages" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:p-4">
            <Button type="button" variant="secondary" disabled={page <= 1 || state === "loading"} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} />Previous</Button>
            <span className="text-xs font-medium text-slate-600">{page} / {totalPages}</span>
            <Button type="button" variant="secondary" disabled={page >= totalPages || state === "loading"} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></Button>
          </nav>
        </>
      )}
    </>
  );
}

export function ParentRemindersPage() {
  return <ReminderList role="PARENT" />;
}

export function AccountsRemindersPage() {
  return <ReminderList role="ACCOUNTS" />;
}

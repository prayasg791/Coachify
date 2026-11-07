import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, FilterX, GraduationCap, Search, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { getStudentFeeLedger, getStudents } from "../auth/api.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { Select } from "../components/ui/Select.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";
import { AccountsOfflinePaymentForm } from "./PaymentManagementPage.jsx";
import { PaymentHistorySection } from "../payments/PaymentHistorySection.jsx";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const amount = (paise = 0) => INR.format(paise / 100);
const displayDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
const readableStatus = (value = "") => String(value ?? "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const apiMessage = (error) => error.response?.data?.message || error.message || "Please try again in a moment.";

function PaymentStatus({ status }) {
  const tone = {
    PAID: "success",
    PARTIALLY_PAID: "warning",
    UNPAID: "danger",
    NO_FEE_PLAN: "neutral",
  }[status] ?? "neutral";
  return <Badge tone={tone}>{readableStatus(status)}</Badge>;
}

function LedgerStatus({ value }) {
  const tone = {
    paid: "success",
    settled: "success",
    success: "success",
    "partially paid": "warning",
    "due today": "warning",
    overdue: "danger",
    upcoming: "info",
  }[String(value ?? "").toLowerCase()] ?? "neutral";
  return <Badge tone={tone}>{value || "Unknown"}</Badge>;
}

function LedgerLoading() {
  return (
    <div role="status" aria-label="Loading student fee ledger" className="space-y-5">
      <span className="sr-only">Loading student fee ledger…</span>
      <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="h-5 w-36 rounded bg-slate-100" />
        <div className="mt-5 h-8 w-64 rounded bg-slate-100" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-card"><div className="h-4 w-24 rounded bg-slate-100" /><div className="mt-5 h-6 w-32 rounded bg-slate-100" /></div>)}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-card" />
    </div>
  );
}

function DataTable({ title, description, columns, rows, emptyMessage }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="font-display text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {!rows.length ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>{columns.map((column) => <th key={column.key} scope="col" className={`px-5 py-3 ${column.numeric ? "text-right" : ""}`}>{column.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="text-slate-700 transition-colors hover:bg-slate-50/60">
                    {columns.map((column) => <td key={column.key} className={`px-5 py-3.5 ${column.numeric ? "text-right tabular-nums" : ""}`}>{column.render ? column.render(row) : row[column.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="space-y-3 px-5 py-4">
                {columns.map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-4 text-sm">
                    <span className="shrink-0 text-xs font-medium text-slate-500">{column.label}</span>
                    <span className="min-w-0 text-right text-slate-700">{column.render ? column.render(row) : row[column.key]}</span>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LedgerPage({ studentId }) {
  const { accessToken } = useAuth();
  const [ledger, setLedger] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [paymentNotice, setPaymentNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setLedger(null);
    setError("");

    getStudentFeeLedger({ studentId, accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !response.data?.student || !response.data?.feePlan || !response.data?.totals || !Array.isArray(response.data?.instalments) || !Array.isArray(response.data?.paymentHistory)) {
          throw new Error("The fee ledger API returned an unexpected response.");
        }
        setLedger(response.data);
        setState("success");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(apiMessage(requestError));
        setState("error");
      });

    return () => controller.abort();
  }, [accessToken, studentId, attempt, refreshKey]);

  if (state === "loading") return <LedgerLoading />;
  if (state === "error") {
    return (
      <>
        <PageHeader eyebrow="Accounts · Students" title="Student fee ledger" />
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-card">
          <ErrorState title="Couldn’t load this fee ledger" description={error} onRetry={() => setAttempt((value) => value + 1)} />
        </div>
      </>
    );
  }

  const { student, feePlan, totals, instalments } = ledger;
  const instalmentColumns = [
    { key: "instalmentNumber", label: "Instalment", render: (row) => <span className="font-semibold text-slate-800">#{row.instalmentNumber}</span> },
    { key: "dueDate", label: "Due date", render: (row) => displayDate(row.dueDate) },
    { key: "amountPaise", label: "Amount", numeric: true, render: (row) => amount(row.amountPaise) },
    { key: "amountPaidPaise", label: "Paid", numeric: true, render: (row) => amount(row.amountPaidPaise) },
    { key: "remainingBalancePaise", label: "Balance", numeric: true, render: (row) => amount(row.remainingBalancePaise) },
    { key: "paymentStatus", label: "Payment", render: (row) => <LedgerStatus value={readableStatus(row.paymentStatus)} /> },
    { key: "dueStatus", label: "Due status", render: (row) => <LedgerStatus value={readableStatus(row.dueStatus)} /> },
    { key: "daysOverdue", label: "Days overdue", numeric: true, render: (row) => row.dueStatus === "OVERDUE" && row.remainingBalancePaise > 0 && row.daysOverdue > 0 ? <span className="font-semibold text-rose-700">{row.daysOverdue} days</span> : <span className="text-slate-400">—</span> },
  ];
  const instalmentRows = instalments.map((instalment) => ({ ...instalment, id: instalment.id }));
  const discountDescription = feePlan.discountType
    ? `${readableStatus(feePlan.discountType)}${feePlan.discountValue !== undefined ? ` · ${feePlan.discountValue}${feePlan.discountType === "PERCENTAGE" ? "%" : ""}` : ""}`
    : "Discount";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/accounts/students" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft size={16} />Back to students
        </Link>
        <LedgerStatus value={readableStatus(student.status)} />
      </div>

      <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><UserRound size={22} /></span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Student profile</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-900">{student.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Student ID <span className="font-semibold text-slate-700">{student.studentId}</span></p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><GraduationCap size={14} />{student.centre?.name ?? "Centre unavailable"}{student.centre?.code ? ` · ${student.centre.code}` : ""}</span>
                <span className="inline-flex items-center gap-1.5"><BookOpen size={14} />{student.batch?.name ?? "Batch unavailable"}{student.batch?.course ? ` · ${student.batch.course}` : ""}</span>
                {student.batch?.academicYear && <span>{student.batch.academicYear}</span>}
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:min-w-48">
            <p className="font-semibold text-slate-800">Course period</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5"><CalendarDays size={13} />{displayDate(student.courseStartDate)} – {displayDate(student.courseEndDate)}</p>
          </div>
        </div>
      </section>

      <section aria-label="Fee summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total course fee" value={amount(totals.totalCourseFeePaise)} icon={CircleDollarSign} />
        <StatCard label={discountDescription} value={`−${amount(totals.discountAmountPaise)}`} icon={CircleDollarSign} tone="slate" />
        <StatCard label="Final payable" value={amount(totals.finalPayablePaise)} note={`Fee plan ${readableStatus(feePlan.status)}`} icon={CircleDollarSign} tone="brand" />
        <StatCard label="Total collected" value={amount(totals.amountPaidPaise)} note="Successful payments" icon={CircleDollarSign} tone="green" />
        <StatCard label="Outstanding balance" value={amount(totals.remainingBalancePaise)} note="Remaining instalment balance" icon={CircleDollarSign} tone="amber" />
      </section>

      {paymentNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{paymentNotice}</p>}

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Badge tone="neutral">Fee plan</Badge>
        <span>{readableStatus(feePlan.status)} · {feePlan.discountType ? `${readableStatus(feePlan.discountType)} discount` : "No discount type specified"}</span>
      </div>

      <AccountsOfflinePaymentForm
        studentId={studentId}
        instalments={instalments}
        onRecorded={(notice) => {
          setPaymentNotice(notice);
          setRefreshKey((current) => current + 1);
        }}
      />

      <DataTable
        title="Instalment schedule"
        description="Amount paid and remaining balance reflect successful payments recorded for each instalment."
        columns={instalmentColumns}
        rows={instalmentRows}
        emptyMessage="No instalments in this fee plan"
      />
      <PaymentHistorySection studentId={studentId} refreshKey={refreshKey} />
    </div>
  );
}

export function StudentManagementPage() {
  const location = useLocation();
  const studentId = location.pathname.match(/^\/accounts\/students\/([^/]+)\/?$/)?.[1];
  if (studentId) return <LedgerPage key={studentId} studentId={studentId} />;
  return <StudentDirectory />;
}

function StudentDirectory() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [centreId, setCentreId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [centreOptions, setCentreOptions] = useState([]);
  const [batchOptions, setBatchOptions] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [retryIndex, setRetryIndex] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(centreId ? { centreId } : {}),
    ...(batchId ? { batchId } : {}),
    page,
    limit,
  }), [debouncedSearch, centreId, batchId, page, limit]);

  useEffect(() => {
    const controller = new AbortController();
    if (search.trim() !== debouncedSearch) return () => controller.abort();

    setState("loading");
    setStudents([]);
    setPagination(null);
    setError("");

    getStudents({ filters, accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data) || !response.pagination) {
          throw new Error("The student directory API returned an unexpected response.");
        }
        setStudents(response.data);
        setPagination(response.pagination);
        setCentreOptions((current) => mergeDirectoryOptions(
          current,
          response.data.map((student) => student.centre).filter((centre) => centre?.id && centre?.name),
        ));
        setBatchOptions((current) => mergeDirectoryOptions(
          current,
          response.data
            .filter((student) => student.batch?.id && student.batch?.name && student.centre?.id)
            .map((student) => ({ ...student.batch, centreId: String(student.centre.id) })),
        ));
        setState("success");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(apiMessage(requestError));
        setState("error");
      });

    return () => controller.abort();
  }, [accessToken, filters, retryIndex, search, debouncedSearch]);

  const searching = search.trim() !== debouncedSearch;
  const loading = state === "loading" || searching;
  const filtered = Boolean(debouncedSearch || centreId || batchId);

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCentreId("");
    setBatchId("");
    setPage(1);
  };

  const columns = [
    { key: "studentId", label: "Student ID", render: (student) => <span className="font-semibold text-slate-700">{student.studentId}</span> },
    { key: "name", label: "Student", render: (student) => <span className="font-semibold text-slate-900">{student.name}</span> },
    { key: "centre", label: "Centre", render: (student) => student.centre?.name ?? "—" },
    { key: "batch", label: "Batch", render: (student) => student.batch?.name ?? "—" },
    { key: "course", label: "Course", render: (student) => student.course ?? "—" },
    { key: "paymentStatus", label: "Fee status", render: (student) => <PaymentStatus status={student.paymentStatus} /> },
    { key: "outstandingBalancePaise", label: "Outstanding", numeric: true, render: (student) => <span className="font-semibold tabular-nums text-slate-800">{amount(student.outstandingBalancePaise)}</span> },
    { key: "actions", label: "", numeric: true, render: (student) => (
      <Button variant="subtle" size="sm" aria-label={`View ledger for ${student.name}`} onClick={() => navigate(`/accounts/students/${encodeURIComponent(student.id)}`)}>
        View ledger <ArrowRight size={14} />
      </Button>
    ) },
  ];

  const showingFrom = pagination ? ((pagination.currentPage - 1) * pagination.pageSize) + 1 : 0;
  const showingTo = pagination ? Math.min(pagination.currentPage * pagination.pageSize, pagination.totalRecords) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Students"
        description="Search students and review their fee status and ledger."
        action={pagination && <Badge tone="info">{pagination.totalRecords.toLocaleString("en-IN")} students</Badge>}
      />
      <section className="mb-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] xl:items-end">
          <div className="relative">
            <label htmlFor="student-search" className="mb-1.5 block text-sm font-semibold text-slate-700">Search students</label>
            <Search aria-hidden="true" size={16} className="absolute left-3 top-[38px] text-slate-400" />
            <input id="student-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" autoComplete="off" className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" />
          </div>
          <Select id="student-centre" label="Centre" value={centreId} onChange={(event) => { setCentreId(event.target.value); setBatchId(""); setPage(1); }} disabled={loading}>
            <option value="">All centres</option>
            {centreOptions.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}
          </Select>
          <Select id="student-batch" label="Batch" value={batchId} onChange={(event) => { setBatchId(event.target.value); setPage(1); }} disabled={loading || !centreId}>
            <option value="">{centreId ? "All batches" : "Choose a centre first"}</option>
            {batchOptions.filter((batch) => batch.centreId === centreId).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
          </Select>
          <Button type="button" variant="secondary" className="w-full sm:col-span-2 xl:col-span-1" onClick={clearFilters} disabled={loading || !filtered}>
            <FilterX size={15} />Clear filters
          </Button>
        </div>
        {filtered && (
          <div aria-label="Active filters" className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="mr-1 text-xs font-semibold text-slate-500">Active filters</span>
            {debouncedSearch && <Badge tone="neutral">Search: {debouncedSearch}</Badge>}
            {centreId && <Badge tone="neutral">Centre: {centreOptions.find((centre) => centre.id === centreId)?.name ?? centreId}</Badge>}
            {batchId && <Badge tone="neutral">Batch: {batchOptions.find((batch) => batch.id === batchId)?.name ?? batchId}</Badge>}
          </div>
        )}
      </section>

      {loading && <DirectoryLoading />}
      {state === "error" && !searching && (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-card">
          <ErrorState title="Couldn’t load students" description={error} onRetry={() => setRetryIndex((value) => value + 1)} />
        </div>
      )}
      {state === "success" && !searching && students.length === 0 && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
          <EmptyState
            title={filtered ? "No students match these filters" : "No students to show"}
            description={filtered ? "Try another name or ID, or clear one or more filters." : "No students are currently available in your assigned centres."}
            action={filtered && <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
          />
        </section>
      )}
      {state === "success" && !searching && students.length > 0 && (
        <section aria-label="Student directory" className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 sm:px-6">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{showingFrom}–{showingTo}</span> of <span className="font-semibold text-slate-700">{pagination.totalRecords.toLocaleString("en-IN")}</span>
            </p>
            <Select id="student-page-size" label="Rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }} className="min-h-9 w-auto py-1 text-xs">
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
            </Select>
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-3 ${column.numeric ? "text-right" : ""}`}>{column.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.id} className="transition-colors hover:bg-slate-50/60">
                    {columns.map((column) => <td key={column.key} className={`px-4 py-3.5 ${column.numeric ? "text-right" : ""}`}>{column.render(student)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 lg:hidden">
            {students.map((student) => (
              <article key={student.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{student.studentId}</p>
                  </div>
                  <PaymentStatus status={student.paymentStatus} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div><dt className="text-slate-500">Centre</dt><dd className="mt-1 font-medium text-slate-700">{student.centre?.name ?? "—"}</dd></div>
                  <div><dt className="text-slate-500">Batch · Course</dt><dd className="mt-1 font-medium text-slate-700">{student.batch?.name ?? "—"}{student.course ? ` · ${student.course}` : ""}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Outstanding</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{amount(student.outstandingBalancePaise)}</dd></div>
                </dl>
                <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => navigate(`/accounts/students/${encodeURIComponent(student.id)}`)}>
                  View fee ledger <ArrowRight size={14} />
                </Button>
              </article>
            ))}
          </div>
          <nav aria-label="Student directory pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
            <p aria-live="polite" className="text-xs text-slate-500">Page {pagination.currentPage} of {Math.max(pagination.totalPages, 1)}</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || pagination.currentPage <= 1}>
                <ChevronLeft size={15} />Previous
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={loading || pagination.currentPage >= pagination.totalPages}>
                Next<ChevronRight size={15} />
              </Button>
            </div>
          </nav>
        </section>
      )}
    </>
  );
}

function mergeDirectoryOptions(current, incoming) {
  const options = new Map(current.map((option) => [option.id, option]));
  for (const option of incoming) options.set(String(option.id), { ...option, id: String(option.id) });
  return [...options.values()].sort((first, second) => first.name.localeCompare(second.name));
}

function DirectoryLoading() {
  return (
    <div role="status" aria-label="Loading student directory" className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <span className="sr-only">Loading student directory…</span>
      <div className="hidden animate-pulse lg:block">
        <div className="h-11 bg-slate-50" />
        {Array.from({ length: 7 }, (_, index) => <div key={index} className="flex h-[60px] items-center gap-5 border-t border-slate-100 px-5">{Array.from({ length: 7 }, (_, cell) => <span key={cell} className={`h-3 rounded bg-slate-100 ${cell === 1 ? "w-32" : "w-20"}`} />)}</div>)}
      </div>
      <div className="space-y-4 p-5 lg:hidden">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="animate-pulse border-b border-slate-100 pb-4"><div className="h-4 w-36 rounded bg-slate-100" /><div className="mt-3 h-3 w-24 rounded bg-slate-100" /><div className="mt-4 h-10 rounded bg-slate-50" /></div>)}
      </div>
    </div>
  );
}

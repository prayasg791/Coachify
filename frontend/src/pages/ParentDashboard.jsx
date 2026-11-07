import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Bell,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileText,
  GraduationCap,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext.jsx";
import { useParentStudents } from "../auth/ParentStudentsContext.jsx";
import { getStudentAttendance, getStudentTestHistory } from "../auth/academicRecordApi.js";
import { getStudentFeeLedger } from "../auth/api.js";
import { getStudentPaymentHistory } from "../auth/paymentApi.js";
import { Badge } from "../components/ui/Badge.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const amount = (paise = 0) => INR.format(paise / 100);
const errorMessage = (error) =>
  error.response?.data?.message || error.message || "Please try again in a moment.";
const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
const paymentLabel = (value = "") => String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const paymentTone = (status) => ({
  SUCCESS: "success",
  PENDING: "warning",
  FAILED: "danger",
}[status] ?? "neutral");

function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading parent dashboard" className="space-y-5">
      <span className="sr-only">Loading parent dashboard…</span>
      <div className="animate-pulse rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="h-4 w-32 rounded bg-slate-100" />
        <div className="mt-4 h-7 w-56 max-w-full rounded bg-slate-100" />
        <div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl border border-slate-200/80 bg-white p-5 shadow-card" />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((item) => <div key={item} className="h-64 animate-pulse rounded-xl border border-slate-200/80 bg-white p-5 shadow-card" />)}
      </div>
    </div>
  );
}

function SectionCard({ title, description, action, children, className = "" }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProfileSection({ student, hasLedger }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><GraduationCap size={21} /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Student overview</p>
            <h2 className="mt-1 break-words font-display text-xl font-bold text-slate-900">{student.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Student ID {student.studentId}</p>
          </div>
        </div>
        {!hasLedger && <Badge tone="warning">Fee details unavailable</Badge>}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Centre</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{student.centre?.name ?? "Not returned by available API"}</dd></div>
        <div><dt className="text-xs text-slate-500">Batch</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{student.batch?.name ?? "Not returned by available API"}</dd></div>
        <div><dt className="text-xs text-slate-500">Course</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{student.batch?.course ?? "Not returned by available API"}</dd></div>
        <div><dt className="text-xs text-slate-500">Academic year</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{student.batch?.academicYear ?? "Not returned by available API"}</dd></div>
      </dl>
    </section>
  );
}

function FeeOverview({ ledger, error, studentRecordId, onRetry }) {
  if (error || !ledger) {
    return (
      <SectionCard title="Fee overview" description="Your current fee plan and instalments.">
        <ErrorState
          title="Fee details are unavailable"
          description={error || "No fee ledger was returned for this student."}
          onRetry={onRetry}
        />
      </SectionCard>
    );
  }

  const outstandingInstalments = ledger.instalments.filter((item) => item.remainingBalancePaise > 0);
  const nextInstalment = [...outstandingInstalments].sort(
    (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
  )[0];
  const hasOverdue = outstandingInstalments.some((item) => item.dueStatus === "OVERDUE");

  return (
    <SectionCard
      title="Fee overview"
      description="Your fee totals are provided by the fee ledger."
      action={hasOverdue ? <Badge tone="danger"><AlertTriangle size={13} className="mr-1" />Overdue instalment</Badge> : <Badge tone="success">No overdue instalment</Badge>}
    >
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <StatCard label="Total payable" value={amount(ledger.totals.finalPayablePaise)} note="After discount" icon={CircleDollarSign} />
        <StatCard label="Amount collected" value={amount(ledger.totals.amountPaidPaise)} note="Successful payments" icon={WalletCards} tone="green" />
        <StatCard label="Outstanding" value={amount(ledger.totals.remainingBalancePaise)} note="Balance remaining" icon={AlertTriangle} tone="amber" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-2.5">
          <Clock3 size={17} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <p className="text-xs text-slate-500">Next instalment due</p>
            {nextInstalment
              ? <p className="mt-0.5 text-sm font-semibold text-slate-800">{dateLabel(nextInstalment.dueDate)} · {amount(nextInstalment.remainingBalancePaise)}</p>
              : <p className="mt-0.5 text-sm font-semibold text-slate-800">No remaining instalments</p>}
          </div>
        </div>
        <Link to="/parent/fee-details" state={{ studentRecordId }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
          Make a payment <ArrowRight size={15} />
        </Link>
      </div>
    </SectionCard>
  );
}

function PaymentHistory({ payments, error, studentRecordId, onRetry }) {
  if (error) return <SectionCard title="Recent payments"><ErrorState title="Payment history unavailable" description={error} onRetry={onRetry} /></SectionCard>;
  if (!payments?.length) {
    return <SectionCard title="Recent payments"><EmptyState title="No payment transactions yet" description="Payment transactions will appear here when the API returns them." /></SectionCard>;
  }

  return (
    <SectionCard
      title="Recent payments"
      description="Includes payment statuses returned by the payment history API."
      action={<Link to="/parent/payment-history" state={{ studentRecordId }} className="text-xs font-semibold text-brand-700 hover:text-brand-800">View all</Link>}
    >
      <ul className="divide-y divide-slate-100">
        {payments.slice(0, 4).map((payment) => (
          <li key={payment.id} className="flex min-w-0 items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{payment.transactionId || "Payment transaction"}</p>
              <p className="mt-1 text-xs text-slate-500">{dateLabel(payment.paidAt || payment.createdAt)} · {paymentLabel(payment.paymentMethod)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-slate-900">{amount(payment.amountPaise)}</p>
              <Badge tone={paymentTone(payment.status)}>{paymentLabel(payment.status)}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function AttendanceOverview({ attendance, error, studentRecordId, onRetry }) {
  if (error) return <SectionCard title="Attendance"><ErrorState title="Attendance unavailable" description={error} onRetry={onRetry} /></SectionCard>;
  const records = attendance.records ?? [];
  const presentCount = records.filter((record) => record.status === "PRESENT").length;
  const absentCount = records.filter((record) => record.status === "ABSENT").length;

  return (
    <SectionCard
      title="Attendance"
      description={`Attendance percentage: ${attendance.attendancePercentage === null ? "Not available" : `${attendance.attendancePercentage.toFixed(1)}%`}`}
      action={<Link to="/parent/attendance" state={{ studentRecordId }} className="text-xs font-semibold text-brand-700 hover:text-brand-800">View all</Link>}
    >
      <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
        <div className="rounded-lg bg-emerald-50/70 p-3.5"><p className="text-xs font-medium text-emerald-700">Present</p><p className="mt-1 font-display text-xl font-bold text-emerald-900">{presentCount}</p></div>
        <div className="rounded-lg bg-rose-50/70 p-3.5"><p className="text-xs font-medium text-rose-700">Absent</p><p className="mt-1 font-display text-xl font-bold text-rose-900">{absentCount}</p></div>
      </div>
      {records.length ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {records.slice(0, 4).map((record, index) => (
            <li key={record._id ?? record.id ?? `${record.date}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
              <span className="text-sm text-slate-700">{dateLabel(record.date)}</span>
              <Badge tone={record.status === "PRESENT" ? "success" : record.status === "ABSENT" ? "danger" : "warning"}>{paymentLabel(record.status)}</Badge>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No attendance records yet" />}
    </SectionCard>
  );
}

function PerformanceOverview({ history, error, studentRecordId, onRetry }) {
  const tests = history?.tests ?? [];
  const subjects = useMemo(() => {
    const groups = new Map();
    tests.forEach((test) => {
      const current = groups.get(test.subject) ?? { total: 0, count: 0 };
      current.total += test.percentage;
      current.count += 1;
      groups.set(test.subject, current);
    });
    return [...groups.entries()].map(([subject, values]) => ({
      subject,
      average: values.total / values.count,
    })).sort((left, right) => left.subject.localeCompare(right.subject));
  }, [tests]);
  if (error) return <SectionCard title="Academic performance"><ErrorState title="Test results unavailable" description={error} onRetry={onRetry} /></SectionCard>;
  const trend = [...tests].slice(0, 8).reverse().map((test) => ({
    label: `${test.testName} · ${dateLabel(test.testDate)}`,
    percentage: test.percentage,
    subject: test.subject,
  }));

  return (
    <SectionCard
      title="Academic performance"
      description="Recent scores and subject averages calculated from returned test records."
      action={<Link to="/parent/test-results" state={{ studentRecordId }} className="text-xs font-semibold text-brand-700 hover:text-brand-800">View all</Link>}
    >
      {!tests.length ? <EmptyState title="No test results yet" description="Test scores will appear here when available." /> : (
        <div className="space-y-5 p-4 sm:p-5">
          {trend.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Recent score trend</p>
              <div role="img" aria-label="Recent test score percentages over time" className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
                    <CartesianGrid stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="label" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Score"]} labelFormatter={(label) => label} />
                    <Line type="monotone" dataKey="percentage" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#4f46e5" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {subjects.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Average by subject</p>
              <ul className="divide-y divide-slate-100">
                {subjects.map((item) => <li key={item.subject} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="truncate text-slate-700">{item.subject}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">{item.average.toFixed(1)}%</span>
                </li>)}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Recent tests</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {tests.slice(0, 3).map((test) => <li key={test.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{test.testName}</p><p className="mt-0.5 text-xs text-slate-500">{test.subject} · {dateLabel(test.testDate)}</p></div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{Number(test.percentage).toFixed(1)}%</span>
              </li>)}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function QuickActions({ studentRecordId }) {
  const actions = [
    { to: "/parent/fee-details", label: "Fee details", icon: CircleDollarSign },
    { to: "/parent/fee-details", label: "Make a payment", icon: WalletCards },
    { to: "/parent/payment-history", label: "Payment history", icon: Clock3 },
    { to: "/parent/notifications", label: "Fee notifications", icon: Bell },
    { to: "/parent/attendance", label: "Attendance", icon: Activity },
    { to: "/parent/test-results", label: "Test results", icon: BookOpenCheck },
  ];

  return (
    <section aria-label="Quick actions" className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <h2 className="mb-3 font-display text-base font-bold text-slate-900">Quick actions</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map(({ to, label, icon: Icon }) => (
          <Link key={label} to={to} state={{ studentRecordId }} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <span className="inline-flex min-w-0 items-center gap-2"><Icon size={16} className="shrink-0 text-brand-600" /><span className="truncate">{label}</span></span>
            <ArrowRight size={14} className="shrink-0 text-slate-400" />
          </Link>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><FileText size={14} className="mt-0.5 shrink-0" />Receipts are not available through the current backend API.</p>
    </section>
  );
}

export function ParentDashboard() {
  const { accessToken, user } = useAuth();
  const { studentId: studentRecordId } = useParentStudents();
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("idle");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!studentRecordId) {
      setDashboard(null);
      setStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    setStatus("loading");
    setDashboard(null);

    const requests = [
      getStudentFeeLedger({ studentId: studentRecordId, accessToken, signal: controller.signal }),
      getStudentPaymentHistory({ studentId: studentRecordId, accessToken, signal: controller.signal }),
      getStudentAttendance({ studentId: studentRecordId, accessToken, signal: controller.signal }),
      getStudentTestHistory({ studentId: studentRecordId, accessToken, signal: controller.signal }),
    ];

    Promise.allSettled(requests).then((results) => {
      if (controller.signal.aborted) return;
      const [ledgerResult, paymentsResult, attendanceResult, testsResult] = results;
      const unwrap = (result, validate, section) => {
        if (result.status === "rejected") return { error: errorMessage(result.reason) };
        if (!validate(result.value)) return { error: `The ${section} API returned an unexpected response.` };
        return { data: result.value.data };
      };
      const ledger = unwrap(
        ledgerResult,
        (response) => response?.success && response.data?.student && response.data?.totals && Array.isArray(response.data?.instalments),
        "fee ledger",
      );
      const payments = unwrap(
        paymentsResult,
        (response) => response?.success && Array.isArray(response.data?.payments),
        "payment history",
      );
      const attendance = unwrap(
        attendanceResult,
        (response) => response?.success && response.data?.student && Array.isArray(response.data?.records) && (typeof response.data.attendancePercentage === "number" || response.data.attendancePercentage === null),
        "attendance",
      );
      const tests = unwrap(
        testsResult,
        (response) => response?.success && response.data?.student && Array.isArray(response.data?.tests),
        "test results",
      );

      const student = ledger.data?.student ?? attendance.data?.student ?? tests.data?.student;
      if (!student) {
        setDashboard({
          ledger,
          payments,
          attendance,
          tests,
          student: null,
          error: ledger.error || attendance.error || tests.error || "No student details were returned.",
        });
        setStatus("error");
        return;
      }

      setDashboard({ ledger, payments, attendance, tests, student });
      setStatus("success");
    });

    return () => controller.abort();
  }, [accessToken, studentRecordId, attempt]);

  const retry = () => setAttempt((value) => value + 1);

  return (
    <>
      <PageHeader
        eyebrow="Parent portal"
        title="Overview"
        description={`Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}. See your student’s fees, attendance, and learning progress in one place.`}
        action={studentRecordId && status === "success" ? <Badge tone="success">Live data</Badge> : null}
      />
      {status === "loading" && <DashboardLoading />}
      {status === "error" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
          <ErrorState title="Couldn’t load your student’s information" description={dashboard?.error} onRetry={retry} />
        </section>
      )}
      {status === "idle" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
          <EmptyState title="Select a student to continue" description="Choose a linked student above to load their fees, attendance, and learning progress." />
        </section>
      )}
      {status === "success" && dashboard && (
        <div className="space-y-5">
          {dashboard.student && <ProfileSection student={dashboard.student} hasLedger={Boolean(dashboard.ledger.data)} />}
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <div className="min-w-0 space-y-5">
              <FeeOverview
                ledger={dashboard.ledger.data}
                error={dashboard.ledger.error}
                studentRecordId={studentRecordId}
                onRetry={retry}
              />
              <PaymentHistory
                payments={dashboard.payments.data?.payments}
                error={dashboard.payments.error}
                studentRecordId={studentRecordId}
                onRetry={retry}
              />
              <AttendanceOverview
                attendance={dashboard.attendance.data}
                error={dashboard.attendance.error}
                studentRecordId={studentRecordId}
                onRetry={retry}
              />
            </div>
            <div className="min-w-0 space-y-5">
              <PerformanceOverview
                history={dashboard.tests.data}
                error={dashboard.tests.error}
                studentRecordId={studentRecordId}
                onRetry={retry}
              />
              <QuickActions studentRecordId={studentRecordId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

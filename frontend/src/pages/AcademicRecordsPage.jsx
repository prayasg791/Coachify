import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext.jsx";
import { useParentStudents } from "../auth/ParentStudentsContext.jsx";
import {
  createAttendance,
  createBulkAttendance,
  createBulkTestScores,
  createTestScore,
  getStudentAttendance,
  getStudentTestHistory,
} from "../auth/academicRecordApi.js";
import { getStudents } from "../auth/api.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { Input } from "../components/ui/Input.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { Select } from "../components/ui/Select.jsx";

const PAGE_SIZE = 100;
const BULK_LIMIT = 500;
const STATUS_TONE = { PRESENT: "success", ABSENT: "danger", LEAVE: "warning" };
const statusLabel = (value = "") => String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const errorMessage = (error) =>
  error.response?.data?.message || error.message || "Please try again in a moment.";
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function AcademicTabs({ active }) {
  return (
    <nav aria-label="Academic record type" className="mb-5 flex gap-2 overflow-x-auto rounded-xl border border-slate-200/80 bg-white p-2 shadow-card">
      <Link to="/accounts/attendance" aria-current={active === "attendance" ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${active === "attendance" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
        <Activity size={16} />Attendance
      </Link>
      <Link to="/accounts/test-results" aria-current={active === "tests" ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${active === "tests" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
        <BookOpenCheck size={16} />Test results
      </Link>
    </nav>
  );
}

function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{statusLabel(status) || "Not set"}</Badge>;
}

function AttendanceHistory({ data }) {
  const records = data?.records ?? [];
  const chartData = records.slice(0, 14).reverse().map((record) => ({
    date: formatDate(record.date),
    percentage: record.status === "PRESENT" ? 100 : record.status === "ABSENT" ? 0 : null,
    status: record.status,
  }));
  const percentage = data?.attendancePercentage;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Attendance history</h2>
            <p className="mt-1 text-xs text-slate-500">{data.student.name} · {data.student.studentId}</p>
          </div>
          <Badge tone="info">Attendance percentage excludes leave days</Badge>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)] sm:p-6">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Recent attendance</h3>
          {chartData.length ? (
            <div role="img" aria-label="Recent attendance by date, showing present and absent days" className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                  <Tooltip formatter={(value, _name, item) => [item.payload.status === "LEAVE" ? "Leave" : `${value}%`, "Status"]} />
                  <Bar dataKey="percentage" name="Attendance" radius={[4, 4, 0, 0]}>
                    {chartData.map((item, index) => <Cell key={`${item.date}-${index}`} fill={item.status === "PRESENT" ? "#4f46e5" : item.status === "ABSENT" ? "#f43f5e" : "#cbd5e1"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="grid h-56 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">No attendance records yet.</div>}
        </div>
        <div className="flex flex-col justify-center rounded-xl bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-500">Attendance percentage</p>
          <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900">
            {percentage === null ? "—" : `${percentage.toFixed(1)}%`}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Calculated by the API from PRESENT and ABSENT records only.</p>
        </div>
      </div>
      <div className="border-t border-slate-100">
        {records.length ? (
          <div className="divide-y divide-slate-100 md:grid md:grid-cols-2 md:divide-y-0 md:divide-x">
            {records.map((record, index) => (
              <div key={record._id ?? record.id ?? `${record.date}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm sm:px-6">
                <div><p className="font-medium text-slate-800">{formatDate(record.date)}</p><p className="mt-0.5 text-xs text-slate-500">{record.source === "BULK_UPLOAD" ? "Bulk entry" : "Manual entry"}</p></div>
                <StatusBadge status={record.status} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="No attendance history" description="Records will appear here after attendance is recorded." />}
      </div>
    </section>
  );
}

function TestHistory({ data }) {
  const tests = data?.tests ?? [];
  const chartData = [...tests].slice(0, 12).reverse().map((test) => ({
    name: test.testName,
    subject: test.subject,
    percentage: test.percentage,
    date: formatDate(test.testDate),
  }));

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="font-display text-base font-bold text-slate-900">Test performance</h2>
        <p className="mt-1 text-xs text-slate-500">{data.student.name} · {data.student.studentId}</p>
      </div>
      {chartData.length > 0 && (
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Recent scores</h3>
          <div role="img" aria-label="Recent test scores as percentages" className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Score"]} labelFormatter={(label) => label} />
                <Bar dataKey="percentage" name="Score" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!tests.length ? <EmptyState title="No test results yet" description="Test scores will appear here after they are recorded." /> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-5 py-3">Test</th><th scope="col" className="px-5 py-3">Subject</th><th scope="col" className="px-5 py-3">Date</th><th scope="col" className="px-5 py-3 text-right">Score</th><th scope="col" className="px-5 py-3 text-right">Percentage</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tests.map((test) => <tr key={test.id} className="text-slate-700 hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{test.testName}</td>
                  <td className="px-5 py-3.5">{test.subject}</td>
                  <td className="px-5 py-3.5">{formatDate(test.testDate)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{test.score} / {test.maximumScore}</td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{Number(test.percentage).toFixed(1)}%</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {tests.map((test) => <article key={test.id} className="space-y-2.5 px-5 py-4">
              <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">{test.testName}</h3><Badge tone="info">{Number(test.percentage).toFixed(1)}%</Badge></div>
              <p className="text-xs text-slate-500">{test.subject} · {formatDate(test.testDate)}</p>
              <p className="text-sm font-medium tabular-nums text-slate-700">{test.score} / {test.maximumScore}</p>
            </article>)}
          </div>
        </>
      )}
    </section>
  );
}

function HistoryPanel({ type, studentId, accessToken, refreshKey = 0 }) {
  const [state, setState] = useState("loading");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!studentId) return undefined;
    const controller = new AbortController();
    setState("loading");
    setData(null);
    setError("");
    const request = type === "attendance"
      ? getStudentAttendance({ studentId, accessToken, signal: controller.signal })
      : getStudentTestHistory({ studentId, accessToken, signal: controller.signal });
    request.then((response) => {
      const expected = type === "attendance"
        ? response?.success && response.data?.student && Array.isArray(response.data.records)
        : response?.success && response.data?.student && Array.isArray(response.data.tests);
      if (!expected) throw new Error("The academic records API returned an unexpected response.");
      setData(response.data);
      setState("success");
    }).catch((requestError) => {
      if (controller.signal.aborted) return;
      setError(errorMessage(requestError));
      setState("error");
    });
    return () => controller.abort();
  }, [accessToken, studentId, type, refreshKey, retry]);

  if (state === "loading") return <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><LoadingState label="Loading academic history" /></section>;
  if (state === "error") return <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><ErrorState title="Couldn’t load academic history" description={error} onRetry={() => setRetry((value) => value + 1)} /></section>;
  return type === "attendance" ? <AttendanceHistory data={data} /> : <TestHistory data={data} />;
}

function SearchableStudentSelector({
  accessToken,
  students,
  setStudents,
  selected,
  onToggle,
  centreOptions,
  setCentreOptions,
  batchOptions,
  setBatchOptions,
  search,
  setSearch,
  centreId,
  setCentreId,
  batchId,
  setBatchId,
}) {
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [loadAllBusy, setLoadAllBusy] = useState(false);
  const [retryBatch, setRetryBatch] = useState(false);

  const rememberOptions = useCallback((records) => {
    setCentreOptions((current) => {
      const next = new Map(current.map((item) => [item.id, item]));
      records.forEach((student) => {
        if (student.centre?.id && student.centre?.name) next.set(student.centre.id, { id: student.centre.id, name: student.centre.name });
      });
      return [...next.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
    setBatchOptions((current) => {
      const next = new Map(current.map((item) => [item.id, item]));
      records.forEach((student) => {
        if (student.batch?.id && student.batch?.name) {
          next.set(student.batch.id, {
            id: student.batch.id,
            name: student.batch.name,
            centreId: student.centre?.id,
          });
        }
      });
      return [...next.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, [setBatchOptions, setCentreOptions]);

  const searchStudents = async (event, nextPage = 1) => {
    event?.preventDefault();
    if (!search.trim() && !centreId && !batchId) {
      setError("Enter a student name or ID, or select a centre or batch.");
      return;
    }
    setRetryBatch(false);
    setState("loading");
    setStudents([]);
    setError("");
    setPage(nextPage);
    try {
      const response = await getStudents({
        accessToken,
        filters: {
          search: search.trim() || undefined,
          centreId: centreId || undefined,
          batchId: batchId || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        },
      });
      if (!response?.success || !Array.isArray(response.data) || !response.pagination) {
        throw new Error("The student directory API returned an unexpected response.");
      }
      setStudents(response.data);
      setPagination(response.pagination);
      rememberOptions(response.data);
      setState("success");
    } catch (requestError) {
      setError(errorMessage(requestError));
      setState("error");
    }
  };

  const loadBatch = async () => {
    if (!batchId) return;
    const selectedBatch = batchOptions.find((batch) => batch.id === batchId);
    const selectedCentreId = selectedBatch?.centreId || centreId;
    if (!selectedCentreId) {
      setError("Choose a centre before loading its batch.");
      return;
    }
    setRetryBatch(true);
    setLoadAllBusy(true);
    setError("");
    setStudents([]);
    setState("loading");
    try {
      const firstResponse = await getStudents({
        accessToken,
        filters: { centreId: selectedCentreId, batchId, page: 1, limit: PAGE_SIZE },
      });
      if (!firstResponse?.success || !Array.isArray(firstResponse.data) || !firstResponse.pagination) {
        throw new Error("The student directory API returned an unexpected response.");
      }
      const { totalRecords, totalPages } = firstResponse.pagination;
      if (totalRecords > BULK_LIMIT) {
        throw new Error(`This batch has ${totalRecords.toLocaleString("en-IN")} students. The academic-record API supports up to ${BULK_LIMIT} students per bulk submission; use student search to record smaller groups.`);
      }
      const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
      const pageResponses = await Promise.all(remainingPages.map((nextPage) =>
        getStudents({
          accessToken,
          filters: { centreId: selectedCentreId, batchId, page: nextPage, limit: PAGE_SIZE },
        }),
      ));
      const records = [...firstResponse.data];
      pageResponses.forEach((response) => {
        if (!response?.success || !Array.isArray(response.data)) {
          throw new Error("The student directory API returned an unexpected response.");
        }
        records.push(...response.data);
      });
      setStudents(records);
      setPagination(null);
      setPage(1);
      rememberOptions(records);
      setState("success");
    } catch (requestError) {
      setError(errorMessage(requestError));
      setState("error");
    } finally {
      setLoadAllBusy(false);
    }
  };

  const visibleStudents = students;
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((student) => selected.has(student.id));
  const selectedInResults = visibleStudents.filter((student) => selected.has(student.id)).length;
  const changePage = (nextPage) => searchStudents(null, nextPage);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Users size={17} /></span>
        <div><h2 className="font-display text-base font-bold text-slate-900">Choose students</h2><p className="mt-1 text-xs leading-5 text-slate-500">Search by student name or ID. Centre and batch options become available from actual directory results.</p></div>
      </div>
      <form onSubmit={searchStudents} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]">
        <div className="relative">
          <label htmlFor="academic-student-search" className="mb-1.5 block text-sm font-semibold text-slate-700">Student search</label>
          <Search aria-hidden="true" size={16} className="absolute left-3 top-[38px] text-slate-400" />
          <input id="academic-student-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" autoComplete="off" className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" />
        </div>
        <Select id="academic-centre-filter" label="Centre" value={centreId} onChange={(event) => { setCentreId(event.target.value); setBatchId(""); }} disabled={state === "loading"}>
          <option value="">All discovered centres</option>
          {centreOptions.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}
        </Select>
        <Select id="academic-batch-filter" label="Batch" value={batchId} onChange={(event) => setBatchId(event.target.value)} disabled={state === "loading" || !centreId}>
          <option value="">{centreId ? "All discovered batches" : "Choose a centre first"}</option>
          {batchOptions.filter((batch) => batch.centreId === centreId).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
        </Select>
        <Button type="submit" className="w-full sm:col-span-2 xl:col-span-1" loading={state === "loading"}><Search size={15} />Find students</Button>
      </form>
      {batchId && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
        <p className="text-xs text-slate-600">Load every student in the selected batch for a bulk entry, up to {BULK_LIMIT} records.</p>
        <Button type="button" size="sm" variant="secondary" onClick={loadBatch} loading={loadAllBusy}><Users size={14} />Load batch</Button>
      </div>}
      {(search || centreId || batchId) && <div aria-label="Active filters" className="mt-3 flex flex-wrap gap-2">
        {search.trim() && <Badge tone="neutral">Search: {search.trim()}</Badge>}
        {centreId && <Badge tone="neutral">Centre: {centreOptions.find((centre) => centre.id === centreId)?.name ?? centreId}</Badge>}
        {batchId && <Badge tone="neutral">Batch: {batchOptions.find((batch) => batch.id === batchId)?.name ?? batchId}</Badge>}
        <button type="button" onClick={() => { setSearch(""); setCentreId(""); setBatchId(""); setStudents([]); setPagination(null); setState("idle"); setError(""); }} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"><FilterX size={13} />Clear</button>
      </div>}
      {error && state !== "error" && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      {state === "loading" && <div className="mt-4"><LoadingState label="Loading student directory" /></div>}
      {state === "error" && <div className="mt-3"><ErrorState title="Couldn’t load students" description={error} onRetry={retryBatch ? loadBatch : () => searchStudents(null, page)} /></div>}
      {state === "idle" && <div className="mt-3"><EmptyState title="Find students to get started" description="The directory search is scoped to your assigned centres. Use the centre and batch filters to prepare a group entry." /></div>}
      {state === "success" && !students.length && <div className="mt-3"><EmptyState title="No matching students" description="Try a different name or student ID, or clear a filter." /></div>}
      {state === "success" && students.length > 0 && <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 py-3">
          <p className="text-xs text-slate-500">
            {pagination ? `Page ${pagination.currentPage} · ${pagination.totalRecords.toLocaleString("en-IN")} matching students` : `${students.length} students in batch`}
            {selectedInResults ? ` · ${selectedInResults} selected on this page` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => {
              const next = new Map(selected);
              visibleStudents.forEach((student) => allVisibleSelected ? next.delete(student.id) : next.set(student.id, student));
              onToggle(next);
            }}>{allVisibleSelected ? "Unselect page" : "Select page"}</Button>
            {pagination?.totalPages > 1 && <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="subtle" disabled={page <= 1 || state === "loading"} aria-label="Previous student page" onClick={() => changePage(page - 1)}><ChevronLeft size={16} /></Button>
              <span className="px-1 text-xs tabular-nums text-slate-500">{page} / {pagination.totalPages}</span>
              <Button type="button" size="sm" variant="subtle" disabled={page >= pagination.totalPages || state === "loading"} aria-label="Next student page" onClick={() => changePage(page + 1)}><ChevronRight size={16} /></Button>
            </div>}
          </div>
        </div>
        <div className="mt-1 divide-y divide-slate-100">
          {students.map((student) => <label key={student.id} className="flex cursor-pointer items-start gap-3 px-1 py-3.5 transition hover:bg-slate-50/60">
            <input type="checkbox" checked={selected.has(student.id)} onChange={() => {
              const next = new Map(selected);
              if (next.has(student.id)) next.delete(student.id);
              else next.set(student.id, student);
              onToggle(next);
            }} className="mt-1 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{student.name}<span className="ml-1.5 font-normal text-slate-500">· {student.studentId}</span></span>
              <span className="mt-1 block text-xs text-slate-500">{student.centre?.name ?? "Centre unavailable"} · {student.batch?.name ?? "Batch unavailable"}{student.course ? ` · ${student.course}` : ""}</span>
            </span>
            <Badge tone="neutral">Student</Badge>
          </label>)}
        </div>
      </>}
    </section>
  );
}

function AttendanceEntry({ selected, onClear, onSaved }) {
  const { accessToken } = useAuth();
  const [date, setDate] = useState(today);
  const [statuses, setStatuses] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const students = [...selected.values()];
  const ready = students.length > 0 && students.length <= BULK_LIMIT && students.every((student) => statuses[student.id]);

  useEffect(() => {
    setStatuses((current) => Object.fromEntries([...selected.keys()].map((id) => [id, current[id] ?? ""])));
  }, [selected]);

  const submit = async () => {
    if (!ready || !date) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const records = students.map((student) => ({ studentId: student.id, status: statuses[student.id] }));
      const response = records.length === 1
        ? await createAttendance({ accessToken, attendance: { ...records[0], date } })
        : await createBulkAttendance({ accessToken, attendance: { date, records } });
      const confirmed = records.length === 1
        ? response?.success && response.data?.attendance
        : response?.success && Array.isArray(response.data?.attendance) && response.data.attendance.length === records.length;
      if (!confirmed) throw new Error(response?.message || "The server did not confirm the attendance records.");
      setConfirmOpen(false);
      setNotice(`Attendance recorded for ${records.length} ${records.length === 1 ? "student" : "students"}.`);
      onSaved();
    } catch (requestError) {
      setError(errorMessage(requestError));
      if (requestError.response?.status === 409) onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!students.length) return <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No students selected" description="Find and select one or more students before preparing attendance." /></section>;

  return <>
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-display text-base font-bold text-slate-900">Record attendance</h2><p className="mt-1 text-xs text-slate-500">Select a status for every student. Duplicate records for the same date are rejected by the server.</p></div>
        <Badge tone="info">{students.length} selected</Badge>
      </div>
      <div className="mb-4 max-w-xs"><Input id="attendance-date" label="Attendance date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {students.map((student) => <div key={student.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
          <div><p className="text-sm font-semibold text-slate-800">{student.name}</p><p className="mt-0.5 text-xs text-slate-500">{student.studentId} · {student.batch?.name ?? "Batch unavailable"}</p></div>
          <Select id={`attendance-status-${student.id}`} label={`Status for ${student.name}`} value={statuses[student.id] ?? ""} onChange={(event) => setStatuses((current) => ({ ...current, [student.id]: event.target.value }))}>
            <option value="">Select status</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LEAVE">Leave</option>
          </Select>
        </div>)}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!ready || !date || saving} onClick={() => setConfirmOpen(true)}><CalendarDays size={15} />Review attendance</Button>
        <Button variant="secondary" onClick={() => { onClear(); setError(""); setNotice(""); }} disabled={saving}>Clear selection</Button>
      </div>
    </section>
    <ConfirmDialog
      open={confirmOpen}
      title="Confirm attendance entry"
      description={`Record attendance for ${students.length} ${students.length === 1 ? "student" : "students"} on ${formatDate(date)}?`}
      confirmLabel="Record attendance"
      onConfirm={submit}
      onCancel={() => !saving && setConfirmOpen(false)}
      loading={saving}
    />
  </>;
}

function TestScoreEntry({ selected, onClear, onSaved }) {
  const { accessToken } = useAuth();
  const [testName, setTestName] = useState("");
  const [subject, setSubject] = useState("");
  const [testDate, setTestDate] = useState(today);
  const [maximumScore, setMaximumScore] = useState("");
  const [scores, setScores] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const students = [...selected.values()];
  const maxScore = Number(maximumScore);
  const scoreErrors = students.map((student) => {
    const score = scores[student.id];
    if (score === undefined || score === "") return "Enter a score.";
    if (!Number.isFinite(Number(score)) || Number(score) < 0) return "Score must be zero or more.";
    if (!Number.isFinite(maxScore) || maxScore <= 0) return "Enter a valid maximum score.";
    if (Number(score) > maxScore) return "Score cannot exceed maximum marks.";
    return "";
  });
  const ready = students.length > 0 && students.length <= BULK_LIMIT && testName.trim() && subject.trim() && testDate && maxScore > 0 && scoreErrors.every((item) => !item);

  useEffect(() => {
    setScores((current) => Object.fromEntries([...selected.keys()].map((id) => [id, current[id] ?? ""])));
  }, [selected]);

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const records = students.map((student) => ({
        studentId: student.id,
        score: Number(scores[student.id]),
        maximumScore: maxScore,
      }));
      const common = { testName: testName.trim(), subject: subject.trim(), testDate };
      const response = records.length === 1
        ? await createTestScore({ accessToken, score: { ...common, ...records[0] } })
        : await createBulkTestScores({ accessToken, scores: { ...common, records } });
      const confirmed = records.length === 1
        ? response?.success && response.data?.testScore
        : response?.success && Array.isArray(response.data?.testScores) && response.data.testScores.length === records.length;
      if (!confirmed) throw new Error(response?.message || "The server did not confirm the test scores.");
      setConfirmOpen(false);
      setNotice(`Test scores recorded for ${records.length} ${records.length === 1 ? "student" : "students"}.`);
      onSaved();
    } catch (requestError) {
      setError(errorMessage(requestError));
      if (requestError.response?.status === 409) onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!students.length) return <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No students selected" description="Find and select one or more students before entering test results." /></section>;

  return <>
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-display text-base font-bold text-slate-900">Enter test scores</h2><p className="mt-1 text-xs text-slate-500">Every score is checked against the maximum marks before sending it to the API.</p></div>
        <Badge tone="info">{students.length} selected</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Input id="test-name" label="Test name" value={testName} onChange={(event) => setTestName(event.target.value)} required maxLength={200} />
        <Input id="test-subject" label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
        <Input id="test-date" label="Test date" type="date" value={testDate} onChange={(event) => setTestDate(event.target.value)} required />
        <Input id="test-maximum-score" label="Maximum marks" type="number" min="0.01" step="any" value={maximumScore} onChange={(event) => setMaximumScore(event.target.value)} required />
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {students.map((student, index) => <div key={student.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
          <div><p className="text-sm font-semibold text-slate-800">{student.name}</p><p className="mt-0.5 text-xs text-slate-500">{student.studentId} · {student.batch?.name ?? "Batch unavailable"}</p></div>
          <Input id={`test-score-${student.id}`} label={`Score for ${student.name}`} type="number" min="0" step="any" max={maxScore || undefined} value={scores[student.id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [student.id]: event.target.value }))} error={scores[student.id] !== undefined && scores[student.id] !== "" && scoreErrors[index] ? scoreErrors[index] : ""} />
        </div>)}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!ready || saving} onClick={() => setConfirmOpen(true)}><BookOpenCheck size={15} />Review scores</Button>
        <Button variant="secondary" onClick={() => { onClear(); setError(""); setNotice(""); }} disabled={saving}>Clear selection</Button>
      </div>
    </section>
    <ConfirmDialog
      open={confirmOpen}
      title="Confirm test score entry"
      description={`Record “${testName.trim()}” in ${subject.trim()} for ${students.length} ${students.length === 1 ? "student" : "students"}? Scores will be submitted to the server for validation.`}
      confirmLabel="Record scores"
      onConfirm={submit}
      onCancel={() => !saving && setConfirmOpen(false)}
      loading={saving}
    />
  </>;
}

export function AccountsAcademicRecordsPage({ initialTab = "attendance" }) {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(new Map());
  const [search, setSearch] = useState("");
  const [centreOptions, setCentreOptions] = useState([]);
  const [batchOptions, setBatchOptions] = useState([]);
  const [centreId, setCentreId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => setTab(initialTab), [initialTab]);

  const focusedStudent = useMemo(() => selected.values().next().value, [selected]);
  const clearSelection = () => setSelected(new Map());
  const saved = () => setRefreshKey((current) => current + 1);
  const title = tab === "attendance" ? "Attendance management" : "Test results";
  const description = tab === "attendance"
    ? "Record individual or batch attendance, then review the selected student’s history."
    : "Enter and validate scores individually or for a batch, and review performance history.";

  return <>
    <PageHeader eyebrow="Accounts · Academic records" title={title} description={description} />
    <AcademicTabs active={tab} />
    <div className="space-y-5">
      <SearchableStudentSelector
        accessToken={accessToken}
        students={students}
        setStudents={setStudents}
        selected={selected}
        onToggle={setSelected}
        centreOptions={centreOptions}
        setCentreOptions={setCentreOptions}
        batchOptions={batchOptions}
        setBatchOptions={setBatchOptions}
        search={search}
        setSearch={setSearch}
        centreId={centreId}
        setCentreId={setCentreId}
        batchId={batchId}
        setBatchId={setBatchId}
      />
      {selected.size > BULK_LIMIT && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">Select no more than {BULK_LIMIT} students per submission.</p>}
      {tab === "attendance"
        ? <AttendanceEntry selected={selected} onClear={clearSelection} onSaved={saved} />
        : <TestScoreEntry selected={selected} onClear={clearSelection} onSaved={saved} />}
      {focusedStudent && <HistoryPanel key={`${tab}-${focusedStudent.id}`} type={tab} studentId={focusedStudent.id} accessToken={accessToken} refreshKey={refreshKey} />}
    </div>
  </>;
}

function ParentAcademicPage({ type }) {
  const { accessToken } = useAuth();
  const { studentId } = useParentStudents();

  return <>
    <PageHeader
      eyebrow="Parent portal"
      title={type === "attendance" ? "Attendance" : "Test results"}
      description={type === "attendance" ? "View the attendance percentage and attendance history for your linked student." : "Review the linked student’s scores and subject-wise performance."}
    />
    {studentId
      ? <HistoryPanel key={`${type}-${studentId}`} type={type} studentId={studentId} accessToken={accessToken} />
      : <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="Academic records are private" description="Choose a linked student above to view records. The API enforces student ownership and consent before returning any records." /></section>}
  </>;
}

export function ParentAttendancePage() {
  return <ParentAcademicPage type="attendance" />;
}

export function ParentTestResultsPage() {
  return <ParentAcademicPage type="tests" />;
}

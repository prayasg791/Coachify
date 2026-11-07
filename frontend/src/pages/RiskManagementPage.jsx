import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Search,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  assignRiskFlag,
  getRiskCounsellors,
  getRiskFlags,
  getRiskTasks,
  reviewRiskTask,
} from "../auth/api.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.jsx";
import { Input } from "../components/ui/Input.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { Select } from "../components/ui/Select.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

const PAGE_SIZE = 20;

const getErrorMessage = (error, fallback) =>
  error.response?.data?.message || error.message || fallback;

const idString = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return String(value._id ?? value.id ?? "");
  return "";
};

const userCentreIds = (user) =>
  [...new Set((Array.isArray(user?.centres) ? user.centres : []).map(idString).filter(Boolean))];

const displayStatus = (status) =>
  String(status ?? "Unknown").replaceAll("_", " ").toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function RiskLevelBadge({ level }) {
  const tone = level === "HIGH" ? "warning" : level === "MEDIUM" ? "info" : "neutral";
  return <Badge tone={tone}>{level ?? "Unknown"} risk</Badge>;
}

function RiskStatusBadge({ status }) {
  const tone = status === "RESOLVED"
    ? "success"
    : status === "REVIEWED"
      ? "info"
      : status === "OPEN"
        ? "warning"
        : "neutral";
  return <Badge tone={tone}>{displayStatus(status)}</Badge>;
}

function SignalList({ signals }) {
  const values = [
    signals?.attendancePercentage != null && {
      label: "Attendance",
      value: `${signals.attendancePercentage}%`,
    },
    signals?.missedInstalments != null && {
      label: "Missed instalments",
      value: String(signals.missedInstalments),
    },
    signals?.testScoreTrend && {
      label: "Test trend",
      value: displayStatus(signals.testScoreTrend),
    },
  ].filter(Boolean);

  if (!values.length) {
    return <p className="text-xs text-slate-400">No signal details available.</p>;
  }

  return (
    <dl className="flex flex-wrap gap-2">
      {values.map(({ label, value }) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
          <dd className="mt-0.5 text-xs font-semibold text-slate-700">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Reasons({ reasons }) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return <p className="text-sm text-slate-400">No reasons supplied.</p>;
  }
  return (
    <ul className="space-y-1">
      {reasons.map((reason, index) => (
        <li key={`${reason}-${index}`} className="flex gap-2 text-sm leading-5 text-slate-600">
          <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}

function Pagination({ pagination, page, onPageChange }) {
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs text-slate-500">
        {pagination?.totalRecords ?? 0} {pagination?.totalRecords === 1 ? "record" : "records"}
        <span className="mx-1.5 text-slate-300">·</span>
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} /> Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

function Notice({ tone = "success", children }) {
  const styles = tone === "error"
    ? "border-rose-100 bg-rose-50 text-rose-700"
    : "border-emerald-100 bg-emerald-50 text-emerald-800";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      {tone === "error" ? <AlertCircle size={17} className="mt-0.5 shrink-0" /> : <Check size={17} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

export function AccountsRiskManagementPage() {
  const { user, accessToken } = useAuth();
  const centreIds = useMemo(() => userCentreIds(user), [user]);
  const [centreId, setCentreId] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [flags, setFlags] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assignFlag, setAssignFlag] = useState(null);
  const [eligibleCounsellors, setEligibleCounsellors] = useState([]);
  const [selectedCounsellorId, setSelectedCounsellorId] = useState("");
  const [counsellorsLoading, setCounsellorsLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentConfirmOpen, setAssignmentConfirmOpen] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setFlags([]);
    getRiskFlags({
      filters: {
        ...(centreId ? { centreId } : {}),
        ...(riskLevel ? { riskLevel } : {}),
        ...(status ? { status } : {}),
        page,
        limit: PAGE_SIZE,
      },
      accessToken,
      signal: controller.signal,
    }).then((response) => {
      const data = response?.data;
      if (response?.success !== true || !Array.isArray(data?.flags) || !data?.pagination) {
        throw new Error(response?.message || "The risk flags response was incomplete.");
      }
      setFlags(data.flags);
      setPagination(data.pagination);
    }).catch((requestError) => {
      if (!controller.signal.aborted) {
        setError(getErrorMessage(requestError, "Unable to load risk flags."));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [accessToken, centreId, riskLevel, status, page, refreshVersion]);

  useEffect(() => {
    if (!assignFlag) return undefined;
    const controller = new AbortController();
    const selectedCentreId = idString(assignFlag.student?.centre?.id);
    setEligibleCounsellors([]);
    setSelectedCounsellorId("");
    setAssignmentError("");
    if (!selectedCentreId) {
      setAssignmentError("This risk record does not include a centre ID, so eligible assignees cannot be verified.");
      return () => controller.abort();
    }

    setCounsellorsLoading(true);
    getRiskCounsellors({ centreId: selectedCentreId, accessToken, signal: controller.signal })
      .then((response) => {
        const counsellors = response?.data?.counsellors;
        if (response?.success !== true || !Array.isArray(counsellors)) {
          throw new Error(response?.message || "The counsellor response was incomplete.");
        }
        setEligibleCounsellors(counsellors);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setAssignmentError(getErrorMessage(requestError, "Unable to load eligible counsellors."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCounsellorsLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, assignFlag]);

  const filteredFlags = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return flags;
    return flags.filter((flag) => [
      flag.student?.name,
      flag.student?.studentId,
      ...(Array.isArray(flag.reasons) ? flag.reasons : []),
    ].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [flags, search]);

  const centreNames = useMemo(() => {
    const names = new Map();
    flags.forEach((flag) => {
      const centre = flag.student?.centre;
      if (centre?.id && centre?.name) names.set(idString(centre.id), centre.name);
    });
    return names;
  }, [flags]);

  const selectedCounsellor = eligibleCounsellors.find(
    (counsellor) => idString(counsellor.id) === selectedCounsellorId,
  );

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
    setNotice("");
  };

  const openAssignment = (flag) => {
    setAssignFlag(flag);
    setAssignmentConfirmOpen(false);
    setNotice("");
  };

  const confirmAssignment = async () => {
    if (!assignFlag || !selectedCounsellorId) return;
    setAssignmentLoading(true);
    setAssignmentError("");
    try {
      const response = await assignRiskFlag({
        riskFlagId: assignFlag.id,
        counsellorId: selectedCounsellorId,
        accessToken,
      });
      if (
        response?.success !== true ||
        response?.data?.id !== assignFlag.id ||
        response?.data?.status !== "OPEN" ||
        idString(response?.data?.assignedTo) !== selectedCounsellorId
      ) {
        throw new Error(response?.message || "The assignment response was incomplete.");
      }
      setAssignFlag(null);
      setAssignmentConfirmOpen(false);
      setNotice("The task was assigned successfully.");
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setAssignmentError(getErrorMessage(requestError, "Unable to assign this follow-up task."));
      setAssignmentConfirmOpen(false);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const activeFilters = [centreId, riskLevel, status].filter(Boolean).length;

  return (
    <>
      <PageHeader
        eyebrow="Accounts workspace"
        title="Risk management"
        description="Review follow-up signals and assign open tasks to eligible counsellors."
        action={<Badge tone="info">Follow-up signals</Badge>}
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3.5">
        <CircleHelp size={18} className="mt-0.5 shrink-0 text-brand-700" />
        <p className="text-sm leading-5 text-brand-900">
          Risk indicators are follow-up signals, not definitive predictions. They do not change fees or payments and do not send parent messages.
        </p>
      </div>

      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,1fr))]">
            <div className="relative self-end">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-[14px] text-slate-400" />
              <Input
                id="risk-search"
                aria-label="Search current risk flag page"
                placeholder="Search students or reasons on this page"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-10"
                type="search"
              />
            </div>
            <Select id="risk-centre-filter" label="Centre" value={centreId} onChange={changeFilter(setCentreId)}>
              <option value="">All assigned centres</option>
              {centreIds.map((id) => (
                <option key={id} value={id}>
                  {centreNames.get(id) || `Centre · ${id.slice(-6)}`}
                </option>
              ))}
            </Select>
            <Select id="risk-level-filter" label="Risk level" value={riskLevel} onChange={changeFilter(setRiskLevel)}>
              <option value="">All levels</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
            <Select id="risk-status-filter" label="Status" value={status} onChange={changeFilter(setStatus)}>
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="FALSE_POSITIVE">False positive</option>
              <option value="RESOLVED">Resolved</option>
            </Select>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {activeFilters
              ? `${activeFilters} active ${activeFilters === 1 ? "filter" : "filters"}`
              : "Showing risk flags for your assigned centres"}
            {search.trim() && ` · Search applies to this page only`}
            {(activeFilters > 0 || search.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setCentreId("");
                  setRiskLevel("");
                  setStatus("");
                  setSearch("");
                  setPage(1);
                }}
                className="ml-2 font-semibold text-brand-700 hover:text-brand-800"
              >
                Clear filters
              </button>
            )}
          </p>
        </div>

        {loading ? (
          <LoadingState label="Loading risk flags" />
        ) : error ? (
          <ErrorState title="Risk flags could not be loaded" description={error} onRetry={() => setRefreshVersion((value) => value + 1)} />
        ) : filteredFlags.length === 0 ? (
          <EmptyState
            title={search.trim() ? "No matches on this page" : "No risk flags found"}
            description={search.trim()
              ? "Try another student name, student ID, or reason. Search only checks the currently loaded page."
              : "No flags match the selected filters. Risk records will appear here when available from the backend."}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-slate-50/80">
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Student</th>
                    <th className="px-5 py-3">Centre / batch</th>
                    <th className="px-5 py-3">Risk signals</th>
                    <th className="px-5 py-3">Status / assignee</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFlags.map((flag) => (
                    <tr key={flag.id} className={flag.riskLevel === "HIGH" ? "bg-amber-50/20" : ""}>
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-slate-800">{flag.student?.name || "Student name unavailable"}</p>
                        <p className="mt-1 text-xs text-slate-500">{flag.student?.studentId || "Student ID unavailable"}</p>
                        <div className="mt-2"><RiskLevelBadge level={flag.riskLevel} /></div>
                      </td>
                      <td className="px-5 py-4 align-top text-sm text-slate-600">
                        <p>{flag.student?.centre?.name || "Centre unavailable"}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {[flag.student?.batch?.name, flag.student?.batch?.course, flag.student?.batch?.academicYear].filter(Boolean).join(" · ") || "Batch unavailable"}
                        </p>
                      </td>
                      <td className="max-w-[360px] px-5 py-4 align-top">
                        <Reasons reasons={flag.reasons} />
                        <div className="mt-3"><SignalList signals={flag.signals} /></div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <RiskStatusBadge status={flag.status} />
                        <p className="mt-2 text-sm text-slate-600">{flag.assignedTo?.name || "Unassigned"}</p>
                        {flag.analysisSource && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            {flag.analysisSource === "AI" ? "AI-assisted" : "Rules-based"} analysis
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right align-top">
                        {flag.status === "OPEN" && flag.followUpRequired && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openAssignment(flag)}
                            disabled={!flag.student?.centre?.id}
                            title={!flag.student?.centre?.id ? "Centre information is required to verify eligible counsellors" : undefined}
                          >
                            <UserRoundCheck size={15} /> Assign
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {filteredFlags.map((flag) => (
                <article key={flag.id} className={`rounded-xl border p-4 ${flag.riskLevel === "HIGH" ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-800">{flag.student?.name || "Student name unavailable"}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">{flag.student?.studentId || "Student ID unavailable"}</p>
                    </div>
                    <RiskLevelBadge level={flag.riskLevel} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {[flag.student?.centre?.name, flag.student?.batch?.name, flag.student?.batch?.course].filter(Boolean).join(" · ") || "Centre and batch unavailable"}
                  </p>
                  <div className="mt-3"><Reasons reasons={flag.reasons} /></div>
                  <div className="mt-3"><SignalList signals={flag.signals} /></div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskStatusBadge status={flag.status} />
                      <span className="text-xs text-slate-500">{flag.assignedTo?.name || "Unassigned"}</span>
                    </div>
                    {flag.status === "OPEN" && flag.followUpRequired && (
                      <Button size="sm" variant="secondary" onClick={() => openAssignment(flag)} disabled={!flag.student?.centre?.id}>
                        <UserRoundCheck size={15} /> Assign
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination pagination={pagination} page={page} onPageChange={setPage} />
          </>
        )}
      </section>

      {assignFlag && !assignmentConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => event.target === event.currentTarget && setAssignFlag(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="assign-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-floating sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Follow-up assignment</p>
                <h2 id="assign-title" className="mt-1 font-display text-lg font-bold text-slate-900">Choose a counsellor</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {assignFlag.student?.name || "This student"} · {assignFlag.student?.centre?.name || "Assigned centre"}
                </p>
              </div>
              <button type="button" aria-label="Close assignment dialog" onClick={() => setAssignFlag(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="mt-5">
              {counsellorsLoading ? (
                <LoadingState label="Loading eligible counsellors" />
              ) : assignmentError ? (
                <Notice tone="error">{assignmentError}</Notice>
              ) : eligibleCounsellors.length === 0 ? (
                <EmptyState title="No eligible counsellors" description="The backend returned no active counsellors assigned to this centre." />
              ) : (
                <Select id="risk-assignee" label="Active counsellors assigned to this centre" value={selectedCounsellorId} onChange={(event) => setSelectedCounsellorId(event.target.value)}>
                  <option value="">Select a counsellor</option>
                  {eligibleCounsellors.map((counsellor) => (
                    <option key={idString(counsellor.id)} value={idString(counsellor.id)}>{counsellor.name}</option>
                  ))}
                </Select>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAssignFlag(null)}>Cancel</Button>
              <Button
                onClick={() => setAssignmentConfirmOpen(true)}
                disabled={!selectedCounsellor}
              >
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(assignFlag && assignmentConfirmOpen)}
        title="Confirm task assignment"
        description={`Assign ${assignFlag?.student?.name || "this student"}'s follow-up task to ${selectedCounsellor?.name || "the selected counsellor"}?`}
        confirmLabel="Assign task"
        onConfirm={confirmAssignment}
        onCancel={() => setAssignmentConfirmOpen(false)}
        loading={assignmentLoading}
      />
    </>
  );
}

const outcomeDetails = {
  REVIEWED: {
    label: "Mark reviewed",
    title: "Record review",
    confirm: "Confirm review",
    description: "Mark this task as reviewed. You can continue follow-up later.",
  },
  FALSE_POSITIVE: {
    label: "Mark false positive",
    title: "Record a false positive",
    confirm: "Confirm false positive",
    description: "A non-empty review note is required. This ends further follow-up for this task.",
  },
  RESOLVED: {
    label: "Resolve after follow-up",
    title: "Resolve follow-up task",
    confirm: "Resolve task",
    description: "Confirm that follow-up is complete. Resolved tasks leave the active task list.",
  },
};

export function CounsellorRiskTasksPage() {
  const { user, accessToken } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [action, setAction] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setTasks([]);
    getRiskTasks({ filters: { page, limit: PAGE_SIZE }, accessToken, signal: controller.signal })
      .then((response) => {
        const data = response?.data;
        if (response?.success !== true || !Array.isArray(data?.tasks) || !data?.pagination) {
          throw new Error(response?.message || "The task response was incomplete.");
        }
        setTasks(data.tasks);
        setPagination(data.pagination);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(requestError, "Unable to load your follow-up tasks."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, page, refreshVersion]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tasks;
    return tasks.filter((task) => [
      task.student?.name,
      task.student?.studentId,
      ...(Array.isArray(task.reasons) ? task.reasons : []),
    ].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [tasks, search]);

  const openAction = (task, outcome) => {
    setNotice("");
    setActionError("");
    setAction({ task, outcome, reviewNotes: "" });
    setConfirmOpen(false);
  };

  const submitReview = async () => {
    if (!action) return;
    setActionLoading(true);
    setActionError("");
    try {
      const response = await reviewRiskTask({
        riskFlagId: action.task.id,
        outcome: action.outcome,
        reviewNotes: action.reviewNotes.trim(),
        accessToken,
      });
      if (response?.success !== true || response?.data?.id !== action.task.id || response?.data?.status !== action.outcome) {
        throw new Error(response?.message || "The review response was incomplete.");
      }
      setAction(null);
      setConfirmOpen(false);
      setNotice(action.outcome === "RESOLVED"
        ? "The follow-up task was resolved."
        : action.outcome === "FALSE_POSITIVE"
          ? "The false-positive decision was recorded."
          : "The task was marked reviewed.");
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Unable to update this task."));
      setConfirmOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  const currentOutcome = action ? outcomeDetails[action.outcome] : null;
  const needsFalsePositiveNote = action?.outcome === "FALSE_POSITIVE";
  const canContinueReview = Boolean(action) && (!needsFalsePositiveNote || Boolean(action.reviewNotes.trim()));

  return (
    <>
      <PageHeader
        eyebrow="Counsellor workspace"
        title="Follow-up tasks"
        description={`Tasks assigned to ${user?.name || "your account"} for review and follow-up.`}
        action={<Badge tone="info">{pagination?.totalRecords ?? 0} active tasks</Badge>}
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3.5">
        <CircleHelp size={18} className="mt-0.5 shrink-0 text-brand-700" />
        <p className="text-sm leading-5 text-brand-900">
          These indicators help prioritize human follow-up; they are not definitive predictions. Signals are the values stored with each risk flag.
        </p>
      </div>

      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div className="max-w-sm">
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-[14px] text-slate-400" />
              <Input
                id="task-search"
                aria-label="Search current task page"
                placeholder="Search students or reasons on this page"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-10"
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">Search checks only the currently loaded page.</p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-slate-500">
            <UserRoundCheck size={15} className="text-brand-600" /> Assigned to you
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading assigned tasks" />
        ) : error ? (
          <ErrorState title="Follow-up tasks could not be loaded" description={error} onRetry={() => setRefreshVersion((value) => value + 1)} />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title={search.trim() ? "No matches on this page" : "No active follow-up tasks"}
            description={search.trim()
              ? "Try another student name, student ID, or reason."
              : "Tasks assigned to your account and requiring follow-up will appear here."}
          />
        ) : (
          <>
            <div className="space-y-3 p-3 sm:p-5">
              {filteredTasks.map((task) => (
                <article key={task.id} className={`rounded-xl border p-4 sm:p-5 ${task.riskLevel === "HIGH" ? "border-amber-200 bg-amber-50/20" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900">{task.student?.name || "Student name unavailable"}</h2>
                        <RiskLevelBadge level={task.riskLevel} />
                        <RiskStatusBadge status={task.status} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{task.student?.studentId || "Student ID unavailable"}</span>
                        {task.student?.centre?.name && <span>{task.student.centre.name}</span>}
                        {task.student?.batch?.name && <span>{task.student.batch.name}</span>}
                        {task.student?.batch?.course && <span>{task.student.batch.course}</span>}
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div>
                          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Follow-up reasons</h3>
                          <Reasons reasons={task.reasons} />
                        </div>
                        <div>
                          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Available indicators</h3>
                          <SignalList signals={task.signals} />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><UserRoundCheck size={14} className="text-slate-400" /> Assigned to you</span>
                        {task.analysisSource && (
                          <span>{task.analysisSource === "AI" ? "AI-assisted" : "Rules-based"} analysis</span>
                        )}
                        {task.reviewedAt && <span>Reviewed {new Date(task.reviewedAt).toLocaleDateString()}</span>}
                      </div>
                      {task.reviewNotes && (
                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600">
                          <span className="font-semibold text-slate-700">Review note: </span>{task.reviewNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-[270px] lg:justify-end">
                      {task.status === "OPEN" && (
                        <Button size="sm" variant="secondary" onClick={() => openAction(task, "REVIEWED")}>
                          <ClipboardCheck size={15} /> Mark reviewed
                        </Button>
                      )}
                      {["OPEN", "REVIEWED"].includes(task.status) && (
                        <Button size="sm" variant="secondary" onClick={() => openAction(task, "FALSE_POSITIVE")}>
                          False positive
                        </Button>
                      )}
                      {task.status === "REVIEWED" && (
                        <Button size="sm" onClick={() => openAction(task, "RESOLVED")}>
                          <Check size={15} /> Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <Pagination pagination={pagination} page={page} onPageChange={setPage} />
          </>
        )}
      </section>

      {action && !confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => event.target === event.currentTarget && setAction(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="review-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-floating sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Task review</p>
                <h2 id="review-title" className="mt-1 font-display text-lg font-bold text-slate-900">{currentOutcome?.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{action.task.student?.name || "Student name unavailable"}</p>
              </div>
              <button type="button" aria-label="Close review dialog" onClick={() => setAction(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{currentOutcome?.description}</p>
            <label htmlFor="risk-review-notes" className="mb-1.5 mt-5 block text-sm font-semibold text-slate-700">
              Review notes {needsFalsePositiveNote ? <span className="text-rose-600">(required)</span> : <span className="font-normal text-slate-400">(optional)</span>}
            </label>
            <textarea
              id="risk-review-notes"
              rows={4}
              maxLength={1000}
              value={action.reviewNotes}
              onChange={(event) => setAction((previous) => ({ ...previous, reviewNotes: event.target.value }))}
              aria-required={needsFalsePositiveNote}
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
              placeholder={needsFalsePositiveNote ? "Explain why this signal is a false positive" : "Add a note for the audit trail"}
            />
            <p className="mt-1 text-right text-xs text-slate-400">{action.reviewNotes.length}/1000</p>
            {actionError && <div className="mt-3"><Notice tone="error">{actionError}</Notice></div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={!canContinueReview}>
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(action && confirmOpen)}
        title={currentOutcome?.title || "Confirm task update"}
        description={`${currentOutcome?.description || ""} Student: ${action?.task?.student?.name || "Student"}.`}
        confirmLabel={currentOutcome?.confirm || "Confirm"}
        onConfirm={submitReview}
        onCancel={() => setConfirmOpen(false)}
        loading={actionLoading}
        danger={action?.outcome === "FALSE_POSITIVE"}
      />
    </>
  );
}

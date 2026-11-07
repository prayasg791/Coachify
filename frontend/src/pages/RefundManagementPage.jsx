import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useParentStudents } from "../auth/ParentStudentsContext.jsx";
import { getStudentFeeLedger } from "../auth/api.js";
import {
  calculateRefundEstimate,
  createRefundRequest,
  decideRefundRequest,
  getAccountsRefundQueue,
  getStudentRefunds,
  processRefundRequest,
} from "../auth/refundApi.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.jsx";
import { Input } from "../components/ui/Input.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { formatPaise, displayPaymentDate, readablePaymentValue } from "../payments/paymentUtils.js";

const errorMessage = (error) =>
  error.response?.data?.message || error.message || "Please try again in a moment.";

const statusTone = (status) => ({
  PENDING: "warning",
  APPROVED: "info",
  PROCESSING: "warning",
  PROCESSED: "success",
  REJECTED: "danger",
}[status] ?? "neutral");

const activeStatuses = new Set(["PENDING", "APPROVED", "PROCESSING", "PROCESSED"]);

function RefundStatus({ status }) {
  return <Badge tone={statusTone(status)}>{readablePaymentValue(status) || "Unknown"}</Badge>;
}

function FormulaNotice({ text }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
      <p className="font-bold">Demo assumption only — not legal advice or verified institute policy</p>
      <p className="mt-1">{text || "The backend uses a pro-rata estimate based on eligible successful payments and unused course days. Confirm the applicable institute policy with the institute."}</p>
    </div>
  );
}

function RefundBreakdown({ refund, title = "Refund calculation" }) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-display text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">Total paid</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{formatPaise(refund.totalPaidPaise)}</dd></div>
        <div><dt className="text-xs text-slate-500">Eligible amount</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{formatPaise(refund.eligibleAmountPaise)}</dd></div>
        <div><dt className="text-xs text-slate-500">Unused course days</dt><dd className="mt-1 font-semibold text-slate-800">{refund.unusedCourseDays} of {refund.totalCourseDays} days</dd></div>
        <div><dt className="text-xs text-slate-500">Withdrawal date</dt><dd className="mt-1 font-semibold text-slate-800">{displayPaymentDate(refund.withdrawalDate)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Estimated refund</dt><dd className="mt-1 font-display text-2xl font-extrabold tabular-nums text-brand-700">{formatPaise(refund.estimatedRefundPaise ?? refund.refundAmountPaise)}</dd></div>
      </dl>
    </section>
  );
}

function RefundHistory({ refunds, selectedId, onSelect, selectable = false }) {
  if (!refunds.length) return <EmptyState title="No refund requests yet" description="Submitted requests and their latest status will appear here." />;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">Request</th>
              <th scope="col" className="px-5 py-3">Withdrawal date</th>
              <th scope="col" className="px-5 py-3 text-right">Estimated refund</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">Submitted</th>
              {selectable && <th scope="col" className="px-5 py-3">Details</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refunds.map((refund) => (
              <tr key={refund.id} className={refund.id === selectedId ? "bg-brand-50/40" : "hover:bg-slate-50/60"}>
                <td className="px-5 py-3.5 font-medium text-slate-800">#{refund.id.slice(-6)}</td>
                <td className="px-5 py-3.5">{displayPaymentDate(refund.withdrawalDate)}</td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatPaise(refund.refundAmountPaise)}</td>
                <td className="px-5 py-3.5"><RefundStatus status={refund.status} /></td>
                <td className="px-5 py-3.5">{displayPaymentDate(refund.createdAt)}</td>
                {selectable && <td className="px-5 py-3.5"><Button variant="subtle" size="sm" onClick={() => onSelect(refund.id)} aria-pressed={refund.id === selectedId}>Review</Button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {refunds.map((refund) => (
          <article key={refund.id} className={`space-y-3 p-4 ${refund.id === selectedId ? "bg-brand-50/40" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-semibold text-slate-800">Request #{refund.id.slice(-6)}</p><p className="mt-1 text-xs text-slate-500">Withdrawal {displayPaymentDate(refund.withdrawalDate)}</p></div>
              <RefundStatus status={refund.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-slate-500">Estimated refund</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{formatPaise(refund.refundAmountPaise)}</dd></div>
              <div><dt className="text-slate-500">Submitted</dt><dd className="mt-1 text-slate-700">{displayPaymentDate(refund.createdAt)}</dd></div>
            </dl>
            {selectable && <Button variant="secondary" size="sm" className="w-full" onClick={() => onSelect(refund.id)} aria-pressed={refund.id === selectedId}>Review request</Button>}
          </article>
        ))}
      </div>
    </>
  );
}

export function ParentRefundsPage() {
  const { accessToken } = useAuth();
  const { studentId } = useParentStudents();
  const [ledger, setLedger] = useState(null);
  const [withdrawalDate, setWithdrawalDate] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [estimateState, setEstimateState] = useState("idle");
  const [estimateError, setEstimateError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!studentId) {
      setState("idle");
      setLedger(null);
      setRefunds([]);
      setEstimate(null);
      setWithdrawalDate("");
      setNotice("");
      setError("");
      return undefined;
    }
    const controller = new AbortController();
    setState("loading");
    setLedger(null);
    setRefunds([]);
    setEstimate(null);
    setEstimateState("idle");
    setEstimateError("");
    setWithdrawalDate("");
    setNotice("");
    setConfirmSubmit(false);
    setError("");

    Promise.all([
      getStudentFeeLedger({ studentId, accessToken, signal: controller.signal }),
      getStudentRefunds({ studentId, accessToken, signal: controller.signal }),
    ])
      .then(([ledgerResponse, refundResponse]) => {
        if (!ledgerResponse?.success || !ledgerResponse.data?.student || !ledgerResponse.data?.student?.courseStartDate || !ledgerResponse.data?.student?.courseEndDate) {
          throw new Error("The fee ledger API returned an unexpected response.");
        }
        if (!refundResponse?.success || !Array.isArray(refundResponse.data?.refunds)) {
          throw new Error("The refund history API returned an unexpected response.");
        }
        setLedger(ledgerResponse.data);
        setRefunds(refundResponse.data.refunds);
        setState("success");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(requestError));
        setState("error");
      });

    return () => controller.abort();
  }, [accessToken, studentId, refreshKey]);

  const activeRequestForDate = refunds.some((refund) =>
    activeStatuses.has(refund.status) &&
    String(refund.withdrawalDate).slice(0, 10) === withdrawalDate,
  );

  const calculate = async (event) => {
    event.preventDefault();
    if (!studentId || !withdrawalDate) return;
    setEstimateState("loading");
    setEstimate(null);
    setEstimateError("");
    setNotice("");
    try {
      const response = await calculateRefundEstimate({
        accessToken,
        request: { studentId, withdrawalDate },
      });
      if (!response?.success || !Number.isSafeInteger(response.data?.estimatedRefundPaise)) {
        throw new Error("The refund calculation API returned an unexpected response.");
      }
      setEstimate(response.data);
      setEstimateState("success");
    } catch (requestError) {
      setEstimateError(errorMessage(requestError));
      setEstimateState("error");
    }
  };

  const submitRequest = async () => {
    setSubmitting(true);
    setEstimateError("");
    setNotice("");
    try {
      const response = await createRefundRequest({
        accessToken,
        request: { studentId, withdrawalDate },
      });
      if (!response?.success || !response.data?.id || response.data.status !== "PENDING") {
        throw new Error(response?.message || "The server did not confirm the refund request.");
      }
      setNotice(`Refund request submitted. Request #${String(response.data.id).slice(-6)} is pending Accounts review.`);
      setEstimate(null);
      setEstimateState("idle");
      setConfirmSubmit(false);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setEstimateError(errorMessage(requestError));
      setConfirmSubmit(false);
      if (requestError.response?.status === 409) {
        setRefreshKey((current) => current + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Parent portal" title="Refund requests" description="Review the demo refund estimate and track request status." />
      <FormulaNotice />
      {state === "idle" && <section className="mt-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="Select a student to continue" description="Choose a linked student above to view or submit refund requests." /></section>}
      {state === "loading" && <div role="status" aria-label="Loading refund information" className="mt-5 h-44 animate-pulse rounded-xl border border-slate-200 bg-white shadow-card" />}
      {state === "invalid" && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      {state === "error" && <div className="mt-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><ErrorState title="Couldn’t load refund details" description={error} onRetry={() => setRefreshKey((current) => current + 1)} /></div>}
      {notice && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}

      {state === "success" && ledger && (
        <div className="mt-5 space-y-5">
          <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Student</p>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900">{ledger.student.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{ledger.student.studentId} · Course dates {displayPaymentDate(ledger.student.courseStartDate)} – {displayPaymentDate(ledger.student.courseEndDate)}</p>
          </section>
          <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
            <h2 className="font-display text-base font-bold text-slate-900">Calculate and submit a request</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Enter the withdrawal date to ask the backend for an estimate. The server recalculates the amount when you submit.</p>
            <form onSubmit={calculate} className="mt-4 grid gap-3 sm:grid-cols-[minmax(200px,320px)_auto] sm:items-end">
              <Input id="refund-withdrawal-date" type="date" label="Withdrawal date" value={withdrawalDate} min={String(ledger.student.courseStartDate).slice(0, 10)} max={String(ledger.student.courseEndDate).slice(0, 10)} onChange={(event) => { setWithdrawalDate(event.target.value); setEstimate(null); setEstimateState("idle"); }} required />
              <Button type="submit" variant="secondary" disabled={!withdrawalDate || estimateState === "loading"} loading={estimateState === "loading"} className="w-full sm:w-auto">Calculate estimate</Button>
            </form>
            {activeRequestForDate && <p role="status" className="mt-3 text-sm text-amber-700">An active request already exists for this withdrawal date.</p>}
            {estimateError && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{estimateError}</p>}
          </section>
          {estimateState === "success" && estimate && (
            <>
              <FormulaNotice text={estimate.formulaAssumption} />
              <RefundBreakdown refund={estimate} />
              <Button className="w-full sm:w-auto" disabled={activeRequestForDate || submitting} onClick={() => setConfirmSubmit(true)}>Submit refund request</Button>
            </>
          )}
          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-display text-base font-bold text-slate-900">Request history</h2></div>
            <RefundHistory refunds={refunds} />
          </section>
        </div>
      )}
      <ConfirmDialog
        open={confirmSubmit}
        title="Submit refund request?"
        description={estimate ? `Submit a request for the backend-estimated amount of ${formatPaise(estimate.estimatedRefundPaise)} using withdrawal date ${displayPaymentDate(estimate.withdrawalDate)}? Accounts must review and approve the request before it can be processed. The server will recalculate the amount on submission.` : ""}
        confirmLabel="Submit request"
        loading={submitting}
        onCancel={() => !submitting && setConfirmSubmit(false)}
        onConfirm={submitRequest}
      />
    </>
  );
}

export function AccountsRefundsPage() {
  const { accessToken, user } = useAuth();
  const centreIds = [...new Set((user?.centres ?? []).map((centre) => String(centre?._id ?? centre)))];
  const [filters, setFilters] = useState({ status: '', centreId: '', search: '' });
  const [appliedFilters, setAppliedFilters] = useState({ status: '', centreId: '', search: '' });
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refunds, setRefunds] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [selectedRefundId, setSelectedRefundId] = useState('');
  const [state, setState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [processing, setProcessing] = useState(false);
  const selectedRefund = refunds.find((refund) => refund.id === selectedRefundId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setLoadError('');
    getAccountsRefundQueue({
      accessToken,
      signal: controller.signal,
      filters: {
        ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)),
        page: String(page),
        limit: '10',
      },
    })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data?.refunds) || !response.data?.pagination) {
          throw new Error('The refund queue API returned an unexpected response.');
        }
        const nextRefunds = response.data.refunds;
        setRefunds(nextRefunds);
        setPagination(response.data.pagination);
        setSelectedRefundId((current) => nextRefunds.some((refund) => refund.id === current)
          ? current
          : nextRefunds[0]?.id ?? '');
        setState('success');
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setLoadError(errorMessage(requestError));
        setState('error');
      });
    return () => controller.abort();
  }, [accessToken, appliedFilters, page, refreshKey]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters, search: filters.search.trim() });
  };

  const clearFilters = () => {
    const cleared = { status: '', centreId: '', search: '' };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setPage(1);
  };

  const runAction = async () => {
    if (!selectedRefund || !action) return;
    setProcessing(true);
    setActionError('');
    setNotice('');
    try {
      if (action.type === 'approve' || action.type === 'reject') {
        const response = await decideRefundRequest({
          refundId: selectedRefund.id,
          decision: action.type === 'approve' ? 'APPROVE' : 'REJECT',
          ...(action.type === 'reject' ? { rejectionReason: reason.trim() } : {}),
          accessToken,
        });
        const expectedStatus = action.type === 'approve' ? 'APPROVED' : 'REJECTED';
        if (!response?.success || response.data?.status !== expectedStatus) {
          throw new Error(response?.message || `The server did not confirm ${expectedStatus.toLowerCase()}.`);
        }
        setNotice(`Request #${selectedRefund.id.slice(-6)} ${expectedStatus.toLowerCase()}.`);
        setReason('');
      } else {
        const response = await processRefundRequest({ refundId: selectedRefund.id, accessToken });
        if (!response?.success || response.data?.status !== 'PROCESSED') {
          throw new Error(response?.message || 'The server did not confirm refund processing.');
        }
        setNotice(`Refund processed and confirmed by the server. Reference ${response.data.refundTransactionId}.`);
      }
      setAction(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setActionError(errorMessage(requestError));
      setAction(null);
      if (requestError.response?.status === 409) setRefreshKey((value) => value + 1);
    } finally {
      setProcessing(false);
    }
  };

  const canApproveReject = selectedRefund?.status === 'PENDING';
  const canProcess = selectedRefund?.status === 'APPROVED';
  const totalPages = pagination?.totalPages || 1;

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Refund management" description="Review and process refund requests across your assigned centres." />
      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <form onSubmit={applyFilters}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(240px,1.4fr)]">
            <div>
              <label htmlFor="accounts-refund-status" className="mb-1.5 block text-sm font-semibold text-slate-700">Request status</label>
              <select id="accounts-refund-status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10">
                <option value="">All statuses</option>
                {['PENDING', 'APPROVED', 'PROCESSING', 'PROCESSED', 'REJECTED'].map((status) => <option key={status} value={status}>{readablePaymentValue(status)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="accounts-refund-centre" className="mb-1.5 block text-sm font-semibold text-slate-700">Centre</label>
              <select id="accounts-refund-centre" value={filters.centreId} onChange={(event) => setFilters((current) => ({ ...current, centreId: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10">
                <option value="">All assigned centres</option>
                {centreIds.map((centreId) => <option key={centreId} value={centreId}>Centre · {centreId.slice(-6)}</option>)}
              </select>
            </div>
            <Input id="accounts-refund-search" label="Student" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name or student ID" autoComplete="off" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={state === 'loading'} loading={state === 'loading'}>Apply filters</Button>
            <Button type="button" variant="secondary" disabled={state === 'loading'} onClick={clearFilters}>Clear filters</Button>
          </div>
        </form>
      </section>

      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}
      {state === 'loading' && <div role="status" aria-label="Loading refund queue" className="mt-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><span className="sr-only">Loading refund requests…</span><div className="h-60 animate-pulse rounded-xl bg-slate-50" /></div>}
      {state === 'error' && <div className="mt-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><ErrorState title="Couldn’t load refund requests" description={loadError} onRetry={() => setRefreshKey((value) => value + 1)} /></div>}
      {state === 'success' && !refunds.length && <section className="mt-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No refund requests found" description="There are no requests matching these filters in your assigned centres." /></section>}

      {state === 'success' && refunds.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{pagination.totalRecords} request{pagination.totalRecords === 1 ? '' : 's'}</span>
            <span>Page {pagination.currentPage} of {totalPages}</span>
          </div>
          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr>
                  <th scope="col" className="px-4 py-3">Request</th><th scope="col" className="px-4 py-3">Student</th><th scope="col" className="px-4 py-3">Centre / batch</th><th scope="col" className="px-4 py-3">Withdrawal</th><th scope="col" className="px-4 py-3 text-right">Refund</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Details</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {refunds.map((refund) => <tr key={refund.id} className={refund.id === selectedRefundId ? 'bg-brand-50/40' : 'hover:bg-slate-50/60'}>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-800">#{refund.id.slice(-6)}</td>
                    <td className="px-4 py-3.5"><p className="font-semibold text-slate-800">{refund.student?.name}</p><p className="text-xs text-slate-500">{refund.student?.studentId}</p></td>
                    <td className="px-4 py-3.5"><p>{refund.centre?.name}</p><p className="text-xs text-slate-500">{refund.batch?.name ?? 'Batch unavailable'}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5">{displayPaymentDate(refund.withdrawalDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums">{formatPaise(refund.refundAmountPaise)}</td>
                    <td className="px-4 py-3.5"><RefundStatus status={refund.status} /></td>
                    <td className="px-4 py-3.5"><Button variant="subtle" size="sm" onClick={() => { setSelectedRefundId(refund.id); setActionError(''); setReason(''); }}>Open</Button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">
              {refunds.map((refund) => <article key={refund.id} className={`space-y-3 p-4 ${refund.id === selectedRefundId ? 'bg-brand-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">Request #{refund.id.slice(-6)}</p><p className="mt-1 text-sm text-slate-700">{refund.student?.name} · {refund.student?.studentId}</p></div><RefundStatus status={refund.status} /></div>
                <p className="text-xs text-slate-500">{refund.centre?.name} · {refund.batch?.name ?? 'Batch unavailable'}</p>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Refund · {formatPaise(refund.refundAmountPaise)}</span><Button variant="secondary" size="sm" onClick={() => { setSelectedRefundId(refund.id); setActionError(''); setReason(''); }}>Open request</Button></div>
              </article>)}
            </div>
          </section>

          {selectedRefund && (
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
              <div className="space-y-4">
                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Refund request #{selectedRefund.id.slice(-6)}</p><h2 className="mt-1 font-display text-lg font-bold text-slate-900">{selectedRefund.student?.name} · {selectedRefund.student?.studentId}</h2><p className="mt-1 text-sm text-slate-500">{selectedRefund.centre?.name} · {selectedRefund.batch?.name ?? 'Batch unavailable'}</p></div><RefundStatus status={selectedRefund.status} /></div>
                  <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">Submitted</dt><dd className="mt-1 font-medium">{displayPaymentDate(selectedRefund.createdAt)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Withdrawal date</dt><dd className="mt-1 font-medium">{displayPaymentDate(selectedRefund.withdrawalDate)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Processed</dt><dd className="mt-1 font-medium">{selectedRefund.processedAt ? displayPaymentDate(selectedRefund.processedAt) : 'Not processed'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Refund request ID</dt><dd className="mt-1 break-all font-mono text-xs">{selectedRefund.id}</dd></div>
                  </dl>
                </section>
                <RefundBreakdown refund={selectedRefund} title="Submitted refund calculation" />
                {selectedRefund.rejectionReason && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"><strong>Rejection reason:</strong> {selectedRefund.rejectionReason}</p>}
              </div>

              <section className="h-fit rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
                <h3 className="font-display text-base font-bold text-slate-900">Request actions</h3>
                {canApproveReject && <>
                  <label htmlFor="refund-rejection-reason" className="mb-1.5 mt-3 block text-sm font-semibold text-slate-700">Rejection reason (required to reject)</label>
                  <textarea id="refund-rejection-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="Explain why this request is rejected" />
                  <div className="mt-3 flex flex-wrap gap-2"><Button disabled={processing} onClick={() => setAction({ type: 'approve' })}>Approve request</Button><Button variant="danger" disabled={!reason.trim() || processing} onClick={() => setAction({ type: 'reject' })}>Reject request</Button></div>
                </>}
                {canProcess && <Button className="mt-4" disabled={processing} onClick={() => setAction({ type: 'process' })}>Process approved refund</Button>}
                {!canApproveReject && !canProcess && <p className="mt-2 text-sm text-slate-500">No further actions are available for this request status.</p>}
                {actionError && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{actionError}</p>}
              </section>
            </div>
          )}

          <nav aria-label="Refund queue pages" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:p-4">
            <Button type="button" variant="secondary" disabled={page <= 1 || state === 'loading'} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <span className="text-xs font-medium text-slate-600">{page} / {totalPages}</span>
            <Button type="button" variant="secondary" disabled={page >= totalPages || state === 'loading'} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </nav>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(action)}
        title={action?.type === 'approve' ? 'Approve refund request?' : action?.type === 'reject' ? 'Reject refund request?' : 'Process approved refund?'}
        description={action?.type === 'approve'
          ? `Approve request #${selectedRefund?.id.slice(-6)} for ${formatPaise(selectedRefund?.refundAmountPaise ?? 0)}. This does not process a refund.`
          : action?.type === 'reject'
            ? `Reject request #${selectedRefund?.id.slice(-6)} with the reason: ${reason.trim()}`
            : `Process the already-approved amount of ${formatPaise(selectedRefund?.refundAmountPaise ?? 0)} through the existing mock refund processor. The request will only be marked processed after server confirmation.`}
        confirmLabel={action?.type === 'approve' ? 'Approve' : action?.type === 'reject' ? 'Reject request' : 'Process refund'}
        danger={action?.type === 'reject'}
        loading={processing}
        onCancel={() => !processing && setAction(null)}
        onConfirm={runAction}
      />
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useParentStudents } from "../auth/ParentStudentsContext.jsx";
import { getStudentFeeLedger, getStudents } from "../auth/api.js";
import { createUnmatchedPayment as createUnmatchedPaymentRequest, getUnmatchedPayments, initiateParentPayment, matchUnmatchedPayment, processMockPayment, recordOfflinePayment, rejectUnmatchedPayment } from "../auth/paymentApi.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.jsx";
import { Input } from "../components/ui/Input.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { Select } from "../components/ui/Select.jsx";
import { PaymentHistorySection } from "../payments/PaymentHistorySection.jsx";
import { LoadingState } from "../components/ui/States.jsx";
import {
  formatPaise,
  parseRupeesToPaise,
  paymentStatusTone,
  readablePaymentValue,
} from "../payments/paymentUtils.js";

const errorMessage = (error) =>
  error.response?.data?.message || error.message || "Please try again in a moment.";

export function AccountsPaymentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Payments"
        description="Record an offline payment from the student’s fee ledger."
      />
      <section className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><CircleDollarSign size={20} /></span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-900">Choose a student to continue</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Open a student’s ledger to review instalments, record cash, UPI, bank transfer, or cheque payments, and see the updated payment history.</p>
            <Link to="/accounts/students" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">
              Go to student directory <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
      <div className="mt-6"><UnmatchedPaymentsSection /></div>
    </>
  );
}

function UnmatchedPaymentsSection() {
  const { accessToken, user } = useAuth();
  const centres = (user?.centres ?? []).map((centre) => ({ id: String(centre?._id ?? centre?.id ?? centre), name: centre?.name ?? `Centre ID ${String(centre?._id ?? centre?.id ?? centre)}` }));
  const [items, setItems] = useState([]); const [page, setPage] = useState(1); const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState("UNMATCHED"); const [centreId, setCentreId] = useState(""); const [method, setMethod] = useState("");
  const [state, setState] = useState("loading"); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null); const [students, setStudents] = useState([]); const [studentId, setStudentId] = useState("");
  const [instalments, setInstalments] = useState([]); const [instalmentId, setInstalmentId] = useState(""); const [notes, setNotes] = useState(""); const [rejectReason, setRejectReason] = useState(""); const [actionError, setActionError] = useState("");
  const [newRecord, setNewRecord] = useState({ centreId: "", transactionId: "", amount: "", paymentMethod: "UPI", paymentDate: "", payerDetails: "" });
  const [saving, setSaving] = useState(false);
  const fetchQueue = () => setRefresh((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController(); setState("loading"); setItems([]); setError("");
    getUnmatchedPayments({ accessToken, signal: controller.signal, filters: { status, ...(centreId ? { centreId } : {}), ...(method ? { paymentMethod: method } : {}), page, limit: 10 } })
      .then((result) => { if (!result?.success || !Array.isArray(result.data?.items)) throw new Error("Unexpected unmatched payment response."); setItems(result.data.items); setPagination(result.data.pagination); setState("success"); })
      .catch((err) => { if (!controller.signal.aborted) { setError(errorMessage(err)); setState("error"); } });
    return () => controller.abort();
  }, [accessToken, status, centreId, method, page, refresh]);
  useEffect(() => {
    setStudents([]); setInstalments([]); setStudentId(""); setInstalmentId("");
    if (!selected) return;
    const controller = new AbortController();
    getStudents({ accessToken, signal: controller.signal, filters: { centreId: selected.centre?.id ?? selected.centre, page: 1, limit: 100 } })
      .then((result) => setStudents(result?.data ?? []))
      .catch((err) => setActionError(errorMessage(err)));
    return () => controller.abort();
  }, [selected, accessToken]);
  useEffect(() => {
    setInstalments([]); setInstalmentId(""); if (!studentId) return;
    const controller = new AbortController();
    getStudentFeeLedger({ studentId, accessToken, signal: controller.signal }).then((result) => setInstalments((result.data?.instalments ?? []).filter((row) => row.remainingBalancePaise > 0))).catch((err) => setActionError(errorMessage(err)));
    return () => controller.abort();
  }, [studentId, accessToken]);
  const submitNew = async (event) => {
    event.preventDefault(); setSaving(true); setActionError("");
    try { const { amount, ...receipt } = newRecord; await createUnmatchedPaymentRequest({ accessToken, payment: { ...receipt, amountPaise: Math.round(Number(amount) * 100), paymentDate: receipt.paymentDate || undefined } }); setNewRecord({ ...newRecord, transactionId: "", amount: "", paymentDate: "", payerDetails: "" }); fetchQueue(); }
    catch (err) { setActionError(errorMessage(err)); } finally { setSaving(false); }
  };
  const performMatch = async (event) => { event.preventDefault(); if (!selected || !studentId || !instalmentId) return; setSaving(true); setActionError(""); try { await matchUnmatchedPayment({ id: selected._id, accessToken, match: { studentId, instalmentId, reviewNotes: notes } }); setSelected(null); setNotes(""); fetchQueue(); } catch (err) { setActionError(errorMessage(err)); } finally { setSaving(false); } };
  const performReject = async () => { if (!rejectReason.trim()) { setActionError("Enter a reason to reject this payment."); return; } setSaving(true); setActionError(""); try { await rejectUnmatchedPayment({ id: selected._id, accessToken, reason: rejectReason }); setSelected(null); setRejectReason(""); fetchQueue(); } catch (err) { setActionError(errorMessage(err)); } finally { setSaving(false); } };
  const money = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise || 0) / 100);
  return <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
    <div><h2 className="font-display text-lg font-bold text-slate-900">Unmatched payments</h2><p className="mt-1 text-sm text-slate-500">Review receipt references before assigning money to a fee instalment.</p></div>
    <form onSubmit={submitNew} className="mt-5 rounded-lg bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Register an unmatched receipt</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select label="Centre" value={newRecord.centreId} required onChange={(e) => setNewRecord({ ...newRecord, centreId: e.target.value })}><option value="">Select centre</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input label="Reference" required maxLength={100} value={newRecord.transactionId} onChange={(e) => setNewRecord({ ...newRecord, transactionId: e.target.value })} />
        <Input label="Amount (INR)" required type="number" min="0.01" step="0.01" value={newRecord.amount} onChange={(e) => setNewRecord({ ...newRecord, amount: e.target.value })} />
        <Select label="Method" value={newRecord.paymentMethod} onChange={(e) => setNewRecord({ ...newRecord, paymentMethod: e.target.value })}>{["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].map((m) => <option key={m} value={m}>{readablePaymentValue(m)}</option>)}</Select>
        <Input label="Payment date" type="date" value={newRecord.paymentDate} onChange={(e) => setNewRecord({ ...newRecord, paymentDate: e.target.value })} />
        <Input label="Payer/reference details" maxLength={500} value={newRecord.payerDetails} onChange={(e) => setNewRecord({ ...newRecord, payerDetails: e.target.value })} />
      </div><Button className="mt-3" disabled={saving || !newRecord.centreId || !newRecord.transactionId || !Number(newRecord.amount)}>Add to review queue</Button>
    </form>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="UNMATCHED">Unmatched</option><option value="MATCHED">Matched</option><option value="REJECTED">Rejected</option><option value="ALL">All statuses</option></Select>
      <Select label="Centre" value={centreId} onChange={(e) => { setCentreId(e.target.value); setPage(1); }}><option value="">All assigned centres</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      <Select label="Method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">All methods</option>{["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].map((m) => <option key={m} value={m}>{readablePaymentValue(m)}</option>)}</Select>
    </div>
    {state === "loading" && <LoadingState label="Loading unmatched payments" />}
    {state === "error" && <ErrorState title="Couldn’t load payment queue" description={error} onRetry={fetchQueue} />}
    {state === "success" && !items.length && <EmptyState title="No payment records found" description="Receipts added for review will appear here." />}
    {state === "success" && items.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Reference", "Amount", "Method", "Payment date", "Status", ""].map((title) => <th key={title} className="px-3 py-3">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item._id}><td className="px-3 py-3 font-medium">{item.transactionId}</td><td className="px-3 py-3">{money(item.amountPaise)}</td><td className="px-3 py-3">{readablePaymentValue(item.paymentMethod)}</td><td className="px-3 py-3">{new Date(item.paymentDate).toLocaleDateString("en-IN")}</td><td className="px-3 py-3"><Badge tone={item.status === "MATCHED" ? "success" : item.status === "REJECTED" ? "danger" : "warning"}>{item.status}</Badge></td><td className="px-3 py-3"><Button variant="secondary" onClick={() => { setActionError(""); setSelected(item); }}>Review</Button></td></tr>)}</tbody></table></div>}
    {pagination?.pages > 1 && <div className="mt-4 flex items-center justify-between"><span className="text-sm text-slate-500">Page {pagination.page} of {pagination.pages}</span><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    {selected && <div className="mt-5 rounded-lg border border-brand-100 bg-brand-50/40 p-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Review {selected.transactionId}</h3><p className="mt-1 text-sm text-slate-600">{money(selected.amountPaise)} · {readablePaymentValue(selected.paymentMethod)} · {selected.centre?.name ?? "Assigned centre"}</p><p className="text-xs text-slate-500">{selected.payerDetails || "No payer details supplied"}</p></div><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button></div>
      {selected.status === "UNMATCHED" && <><form onSubmit={performMatch} className="mt-4 grid gap-3 sm:grid-cols-2"><Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Select student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.studentId}</option>)}</Select><Select label="Instalment" value={instalmentId} onChange={(e) => setInstalmentId(e.target.value)}><option value="">Select instalment</option>{instalments.map((inst) => <option key={inst.id} value={inst.id}>#{inst.instalmentNumber} · balance {money(inst.remainingBalancePaise)}</option>)}</Select><Input label="Review notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /><Button disabled={saving || !studentId || !instalmentId}>Match and record payment</Button></form><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input label="Rejection reason (required)" maxLength={1000} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /><Button variant="secondary" disabled={saving || !rejectReason.trim()} onClick={performReject}>Reject</Button></div></>}
      {selected.status !== "UNMATCHED" && <p className="mt-3 text-sm text-slate-600">{selected.status} · {selected.reviewNotes || "No review notes"}</p>}{actionError && <p role="alert" className="mt-3 text-sm text-rose-700">{actionError}</p>}
    </div>}
  </section>;
}

export function ParentPaymentsPage() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const { studentId } = useParentStudents();
  const isPaymentHistory = location.pathname === "/parent/payment-history";
  const [ledger, setLedger] = useState(null);
  const [ledgerState, setLedgerState] = useState("idle");
  const [ledgerError, setLedgerError] = useState("");
  const [instalmentId, setInstalmentId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [outcome, setOutcome] = useState("SUCCESS");
  const [message, setMessage] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!studentId) {
      setLedger(null);
      setLedgerState("idle");
      setLedgerError("");
      setInstalmentId("");
      setAmountInput("");
      setMessage(null);
      setPaymentError("");
      return undefined;
    }
    const controller = new AbortController();
    setLedgerState("loading");
    setLedger(null);
    setLedgerError("");
    setInstalmentId("");
    setAmountInput("");
    setMessage(null);
    setPaymentError("");
    setConfirmOpen(false);

    getStudentFeeLedger({ studentId, accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !response.data?.student || !Array.isArray(response.data?.instalments)) {
          throw new Error("The fee ledger API returned an unexpected response.");
        }
        setLedger(response.data);
        setInstalmentId("");
        setLedgerState("success");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLedgerError(errorMessage(error));
        setLedgerState("error");
      });

    return () => controller.abort();
  }, [accessToken, studentId, refreshKey]);

  const outstandingInstalments = useMemo(
    () => ledger?.instalments?.filter((item) => item.remainingBalancePaise > 0) ?? [],
    [ledger],
  );
  const selectedInstalment = outstandingInstalments.find((item) => item.id === instalmentId);
  const amountPaise = parseRupeesToPaise(amountInput);
  const amountError = amountInput && amountPaise === null
    ? "Enter a positive amount with up to two decimal places."
    : amountPaise && selectedInstalment && amountPaise > selectedInstalment.remainingBalancePaise
      ? `Amount cannot exceed the remaining ${formatPaise(selectedInstalment.remainingBalancePaise)}.`
      : "";

  const confirmPayment = async () => {
    if (!selectedInstalment || !amountPaise || amountPaise > selectedInstalment.remainingBalancePaise) return;
    setProcessing(true);
    setPaymentError("");
    setMessage(null);
    let initiated = false;
    try {
      const initiation = await initiateParentPayment({
        accessToken,
        payment: {
          studentId,
          instalmentId: selectedInstalment.id,
          amountPaise,
        },
      });
      if (!initiation?.success || !initiation.data?.id || initiation.data.status !== "PENDING") {
        throw new Error(initiation?.message || "Payment initiation was not confirmed by the server.");
      }
      initiated = true;

      const result = await processMockPayment({
        accessToken,
        payment: { paymentId: initiation.data.id, outcome },
      });
      if (!result?.success || !["SUCCESS", "FAILED"].includes(result.data?.status)) {
        throw new Error(result?.message || "The demo gateway did not confirm a final payment status.");
      }

      setMessage({
        status: result.data.status,
        text: result.data.status === "SUCCESS"
          ? `Demo payment confirmed by the server. Transaction ${result.data.transactionId || result.data.id}.`
          : "The demo gateway reported that this payment failed. The outstanding balance is unchanged.",
      });
      setConfirmOpen(false);
      setAmountInput("");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setPaymentError(errorMessage(error));
      if (initiated) setRefreshKey((current) => current + 1);
    } finally {
      setProcessing(false);
    }
  };

  const canSubmit = Boolean(selectedInstalment && amountPaise && !amountError && !processing);

  return (
    <>
      <PageHeader
        eyebrow="Parent portal"
        title={isPaymentHistory ? "Payment history" : "Fee details & payments"}
        description={isPaymentHistory ? "Review your student’s successful, pending, and failed payment transactions." : "Review outstanding instalments and payment transactions for your student."}
        action={<Badge tone="warning">DEMO PAYMENT FLOW</Badge>}
      />
      <section className="mb-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="text-sm leading-6 text-slate-600">The server verifies the selected student’s ownership and active consent for every request. The mock gateway is a demonstration only; it does not transfer real money.</p>
        </div>
      </section>

      {ledgerState === "idle" && <section className="mb-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="Select a student to continue" description="Choose a linked student above to view fee details and payment history." /></section>}

      {ledgerState === "loading" && (
        <div role="status" aria-label="Loading student fee details" className="animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <span className="sr-only">Loading fee details…</span>
          <div className="h-5 w-48 rounded bg-slate-100" /><div className="mt-4 h-20 rounded bg-slate-100" />
        </div>
      )}
      {ledgerState === "error" && (
        <div className="mb-5 rounded-xl border border-slate-200/80 bg-white shadow-card">
          <ErrorState
            title="Couldn’t load fee details"
            description={ledgerError}
            onRetry={() => setRefreshKey((current) => current + 1)}
          />
        </div>
      )}
      {ledgerState === "invalid" && <p role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{ledgerError}</p>}
      {ledgerState === "success" && ledger && (
        <div className="space-y-5">
          {paymentError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{paymentError}</p>}
          {message && (
            <p role="status" className={`rounded-lg border px-3 py-2.5 text-sm ${message.status === "SUCCESS" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {message.text}
            </p>
          )}
          <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Student fee account</p>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-900">{ledger.student.name}</h2>
                <p className="mt-1 text-sm text-slate-500">Student ID {ledger.student.studentId}</p>
              </div>
              <Badge tone="neutral">{ledger.student.centre?.name ?? "Centre unavailable"}</Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ledger.instalments.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">Instalment #{item.instalmentNumber}</h3>
                    <Badge tone={paymentStatusTone(item.paymentStatus === "PAID" ? "SUCCESS" : item.dueStatus === "OVERDUE" ? "FAILED" : "PENDING")}>
                      {readablePaymentValue(item.dueStatus)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Remaining balance</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatPaise(item.remainingBalancePaise)}</p>
                  <p className="mt-1 text-xs text-slate-500">Due {new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(item.dueDate))}</p>
                </article>
              ))}
            </div>
            {!outstandingInstalments.length && <div className="mt-4"><EmptyState title="No outstanding instalments" description="There is no balance available for payment at this time." /></div>}
          </section>

          {outstandingInstalments.length > 0 && (
            <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
              <div className="mb-4">
                <h2 className="font-display text-base font-bold text-slate-900">Pay an instalment · DEMO</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">This development gateway simulates an outcome and does not charge a payment method.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select id="parent-payment-instalment" label="Outstanding instalment" value={instalmentId} onChange={(event) => { setInstalmentId(event.target.value); setAmountInput(""); }}>
                  <option value="">Select an instalment</option>
                  {outstandingInstalments.map((item) => <option key={item.id} value={item.id}>#{item.instalmentNumber} · balance {formatPaise(item.remainingBalancePaise)}</option>)}
                </Select>
                <Input
                  id="parent-payment-amount"
                  label="Amount (INR)"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  disabled={!selectedInstalment}
                  error={amountError}
                  hint={selectedInstalment ? `Up to ${formatPaise(selectedInstalment.remainingBalancePaise)} remaining` : "Select an instalment first."}
                />
              </div>
              <Select id="parent-demo-outcome" label="Demo gateway outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} className="mt-4 sm:max-w-sm">
                <option value="SUCCESS">Simulate success</option>
                <option value="FAILED">Simulate failure</option>
              </Select>
              <Button className="mt-4 w-full sm:w-auto" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
                Initiate demo payment
              </Button>
            </section>
          )}

          <PaymentHistorySection studentId={studentId} refreshKey={refreshKey} />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm demo payment"
        description={selectedInstalment ? `Initiate a DEMO payment of ${formatPaise(amountPaise ?? 0)} for instalment #${selectedInstalment.instalmentNumber}? The gateway will simulate ${outcome.toLowerCase()}. No real money is transferred.` : ""}
        confirmLabel="Run demo payment"
        onConfirm={confirmPayment}
        onCancel={() => !processing && setConfirmOpen(false)}
        loading={processing}
      />
    </>
  );
}

export function AccountsOfflinePaymentForm({ studentId, instalments, onRecorded }) {
  const { accessToken } = useAuth();
  const [instalmentId, setInstalmentId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [transactionId, setTransactionId] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const outstandingInstalments = instalments.filter((item) => item.remainingBalancePaise > 0);
  const selectedInstalment = outstandingInstalments.find((item) => item.id === instalmentId);
  const amountPaise = parseRupeesToPaise(amountInput);
  const amountError = amountInput && amountPaise === null
    ? "Enter a positive amount with up to two decimal places."
    : amountPaise && selectedInstalment && amountPaise > selectedInstalment.remainingBalancePaise
      ? `Amount cannot exceed the remaining ${formatPaise(selectedInstalment.remainingBalancePaise)}.`
      : "";

  const submitPayment = async () => {
    if (!selectedInstalment || !amountPaise || amountError || !transactionId.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await recordOfflinePayment({
        accessToken,
        payment: {
          studentId,
          instalmentId: selectedInstalment.id,
          amountPaise,
          paymentMethod,
          transactionId: transactionId.trim(),
        },
      });
      if (!response?.success || response.data?.status !== "SUCCESS") {
        throw new Error(response?.message || "The server did not confirm this payment as successful.");
      }
      setAmountInput("");
      setTransactionId("");
      setInstalmentId("");
      setConfirmOpen(false);
      onRecorded(`Payment recorded successfully. Reference ${response.data.transactionId || transactionId.trim()}.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  if (!outstandingInstalments.length) {
    return (
      <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
        <EmptyState title="No balance to record" description="All instalments are paid or there is no outstanding amount." />
      </section>
    );
  }

  return (
    <>
      <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="mb-4">
          <h2 className="font-display text-base font-bold text-slate-900">Record offline payment</h2>
          <p className="mt-1 text-xs text-slate-500">The server records this as successful only after accepting the request.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select id="offline-payment-instalment" label="Instalment" value={instalmentId} onChange={(event) => { setInstalmentId(event.target.value); setAmountInput(""); }}>
            <option value="">Select an instalment</option>
            {outstandingInstalments.map((item) => <option key={item.id} value={item.id}>#{item.instalmentNumber} · {formatPaise(item.remainingBalancePaise)} due</option>)}
          </Select>
          <Input
            id="offline-payment-amount"
            label="Amount (INR)"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            disabled={!selectedInstalment}
            error={amountError}
            hint={selectedInstalment ? `Up to ${formatPaise(selectedInstalment.remainingBalancePaise)} remaining` : "Select an instalment first."}
          />
          <Select id="offline-payment-method" label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
          </Select>
          <Input
            id="offline-payment-reference"
            label="Transaction / receipt number"
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            maxLength={100}
            required
            autoComplete="off"
            hint="Required by the payment API (up to 100 characters)."
          />
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
        <Button
          className="mt-4 w-full sm:w-auto"
          disabled={!selectedInstalment || !amountPaise || Boolean(amountError) || !transactionId.trim() || saving}
          onClick={() => setConfirmOpen(true)}
        >
          Review payment
        </Button>
      </section>
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm offline payment"
        description={selectedInstalment ? `Record ${formatPaise(amountPaise ?? 0)} by ${readablePaymentValue(paymentMethod)} for instalment #${selectedInstalment.instalmentNumber}, reference ${transactionId.trim()}?` : ""}
        confirmLabel="Record payment"
        onConfirm={submitPayment}
        onCancel={() => !saving && setConfirmOpen(false)}
        loading={saving}
      />
    </>
  );
}

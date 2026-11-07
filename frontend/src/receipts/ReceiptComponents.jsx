import { useEffect, useState } from "react";
import { getStudentReceipts } from "../auth/financialApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { formatPaise, readablePaymentValue } from "../payments/paymentUtils.js";

const dateFormat = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const getError = (error) => error.response?.data?.message || error.message || "Could not retrieve receipt.";

export function ReceiptView({ receipt, onClose }) {
  if (!receipt) return null;
  return <div className="receipt-backdrop fixed inset-0 z-[80] overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
    <article className="receipt-print-area mx-auto my-4 max-w-2xl rounded-xl bg-white p-5 shadow-floating sm:my-8 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Payment receipt</p><h2 id="receipt-title" className="mt-1 font-display text-2xl font-extrabold text-slate-900">{receipt.institute?.name}</h2><p className="mt-1 max-w-md whitespace-pre-line text-sm text-slate-500">{receipt.institute?.address}</p></div>
        <Badge tone="success">SUCCESS</Badge>
      </div>
      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><p className="text-xs text-slate-500">Receipt number</p><p className="mt-1 font-semibold">{receipt.receiptNumber}</p></div>
        <div><p className="text-xs text-slate-500">Issue date</p><p className="mt-1 font-semibold">{dateFormat(receipt.issueDate)}</p></div>
        <div><p className="text-xs text-slate-500">Student</p><p className="mt-1 font-semibold">{receipt.student?.name}</p><p className="text-xs text-slate-500">{receipt.student?.studentId}</p></div>
        <div><p className="text-xs text-slate-500">Centre / batch</p><p className="mt-1 font-semibold">{receipt.centre?.name} · {receipt.batch?.name || "Batch unavailable"}</p><p className="text-xs text-slate-500">{receipt.batch?.course} {receipt.batch?.academicYear}</p></div>
        <div><p className="text-xs text-slate-500">Instalment</p><p className="mt-1 font-semibold">#{receipt.instalment?.number} · due {dateFormat(receipt.instalment?.dueDate)}</p><p className="text-xs text-slate-500">Instalment fee {formatPaise(receipt.instalment?.amountPaise)}</p></div>
        <div><p className="text-xs text-slate-500">Payment details</p><p className="mt-1 font-semibold">{readablePaymentValue(receipt.paymentMethod)} · {dateFormat(receipt.paymentDate)}</p><p className="break-all text-xs text-slate-500">Reference: {receipt.transactionId || "—"}</p></div>
      </div>
      <div className="mt-6 rounded-lg border border-slate-200 p-4">
        <div className="flex justify-between gap-4 text-sm"><span>Amount paid</span><strong>{formatPaise(receipt.amountPaidPaise)}</strong></div>
        {receipt.gstConfiguration?.taxability === "NOT_CONFIGURED" ? <p className="mt-3 text-xs text-amber-700">GST details are not configured. No GST amount is represented on this receipt.</p> : <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between gap-3"><span>Taxability</span><span>{receipt.gstConfiguration?.taxability}</span></div>
          {receipt.gstConfiguration?.rateBps != null && <div className="flex justify-between gap-3"><span>GST rate / treatment</span><span>{(receipt.gstConfiguration.rateBps / 100).toFixed(2)}% · {receipt.gstConfiguration.treatment}</span></div>}
          <div className="flex justify-between gap-3"><span>Taxable base</span><span>{formatPaise(receipt.gstBreakdown?.taxableBasePaise)}</span></div>
          <div className="flex justify-between gap-3"><span>GST amount</span><span>{formatPaise(receipt.gstBreakdown?.gstAmountPaise)}</span></div>
          <div className="flex justify-between gap-3 border-t border-slate-100 pt-2 font-semibold"><span>Configured gross amount</span><span>{formatPaise(receipt.gstBreakdown?.grossAmountPaise)}</span></div>
        </div>}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">This receipt records the payment details captured by Coachify. GST treatment reflects the institute configuration active when the receipt was issued.</p>
      <div className="receipt-actions mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => window.print()}>Print / Save as PDF</Button></div>
    </article>
  </div>;
}

export function StudentReceiptList({ studentId }) {
  const { accessToken } = useAuth();
  const [data, setData] = useState(null); const [state, setState] = useState("loading"); const [error, setError] = useState(""); const [retry, setRetry] = useState(0); const [receipt, setReceipt] = useState(null); const [page, setPage] = useState(1);
  useEffect(() => {
    if (!studentId) { setData(null); setState("idle"); return undefined; }
    const controller = new AbortController(); setState("loading"); setError(""); setData(null);
    getStudentReceipts({ studentId, accessToken, page, limit: 20, signal: controller.signal }).then((result) => {
      if (!result?.success || !Array.isArray(result.data?.receipts)) throw new Error("Unexpected receipt response.");
      setData(result.data); setState("success");
    }).catch((err) => { if (!controller.signal.aborted) { setError(getError(err)); setState("error"); } });
    return () => controller.abort();
  }, [studentId, accessToken, page, retry]);
  return <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
    <header className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-display text-base font-bold text-slate-900">Payment receipts</h2><p className="mt-1 text-xs text-slate-500">Receipts are issued by the server for successful transactions.</p></header>
    {state === "loading" && <LoadingState label="Loading receipts" />}
    {state === "error" && <ErrorState title="Couldn’t load receipts" description={error} onRetry={() => setRetry((value) => value + 1)} />}
    {state === "success" && !data?.receipts.length && <EmptyState title="No receipts available" description="A receipt will appear after a successful payment and institute details are configured." />}
    {state === "success" && data?.receipts.length > 0 && <div className="divide-y divide-slate-100">{data.receipts.map((item) => <article key={item._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-800">{item.receiptNumber}</p><p className="mt-1 text-xs text-slate-500">{dateFormat(item.paymentDate)} · {readablePaymentValue(item.paymentMethod)} · {formatPaise(item.amountPaidPaise)}</p></div><Button variant="secondary" onClick={() => setReceipt(item)}>View / download</Button></article>)}</div>}
    {data?.pagination?.pages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm"><span>Page {page} of {data.pagination.pages}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    <ReceiptView receipt={receipt} onClose={() => setReceipt(null)} />
  </section>;
}

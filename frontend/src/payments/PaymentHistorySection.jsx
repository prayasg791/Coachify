import { useEffect, useState } from "react";
import { getStudentPaymentHistory } from "../auth/paymentApi.js";
import { getPaymentReceipt } from "../auth/financialApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ReceiptView } from "../receipts/ReceiptComponents.jsx";
import {
  displayPaymentDate,
  formatPaise,
  paymentStatusTone,
  readablePaymentValue,
} from "./paymentUtils.js";

const errorMessage = (error) =>
  error.response?.data?.message || error.message || "Please try again in a moment.";

export function PaymentHistorySection({ studentId, refreshKey = 0 }) {
  const { accessToken } = useAuth();
  const [payments, setPayments] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [receipt, setReceipt] = useState(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const loadReceipt = async (paymentId) => {
    setReceiptLoadingId(paymentId); setReceiptError("");
    try {
      const result = await getPaymentReceipt({ paymentId, accessToken });
      if (!result?.success || !result.data?.receipt) throw new Error("The receipt API returned an unexpected response.");
      setReceipt(result.data.receipt);
    } catch (err) { setReceiptError(err.response?.data?.message || err.message || "Could not load receipt."); }
    finally { setReceiptLoadingId(""); }
  };

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setPayments([]);
    setError("");

    getStudentPaymentHistory({ studentId, accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data?.payments)) {
          throw new Error("The payment history API returned an unexpected response.");
        }
        setPayments(response.data.payments);
        setState("success");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(requestError));
        setState("error");
      });

    return () => controller.abort();
  }, [accessToken, studentId, refreshKey, retryKey]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="font-display text-base font-bold text-slate-900">Payment history</h2>
        <p className="mt-1 text-xs text-slate-500">Includes successful, pending, and failed transactions returned by the payment API.</p>
      </div>
      {state === "loading" && (
        <div role="status" aria-label="Loading payment history" className="space-y-3 p-5">
          <span className="sr-only">Loading payment history…</span>
          {[0, 1, 2].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      )}
      {state === "error" && (
        <ErrorState
          title="Couldn’t load payment history"
          description={error}
          onRetry={() => setRetryKey((current) => current + 1)}
        />
      )}
      {state === "success" && payments.length === 0 && (
        <EmptyState title="No payment transactions yet" description="Transactions will appear here after they are recorded or initiated." />
      )}
      {state === "success" && payments.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Transaction ID</th>
                  <th scope="col" className="px-5 py-3">Payment date</th>
                  <th scope="col" className="px-5 py-3 text-right">Amount</th>
                  <th scope="col" className="px-5 py-3">Method</th>
                  <th scope="col" className="px-5 py-3">Status / receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => (
                  <tr key={payment.id} className="text-slate-700">
                    <td className="px-5 py-3.5 font-medium text-slate-800">{payment.transactionId || "—"}</td>
                    <td className="px-5 py-3.5">{displayPaymentDate(payment.paidAt || payment.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatPaise(payment.amountPaise)}</td>
                    <td className="px-5 py-3.5">{readablePaymentValue(payment.paymentMethod) || "—"}</td>
                    <td className="px-5 py-3.5"><div className="flex items-center gap-2"><Badge tone={paymentStatusTone(payment.status)}>{readablePaymentValue(payment.status)}</Badge>{payment.status === "SUCCESS" && <Button variant="subtle" size="sm" disabled={receiptLoadingId === payment.id} onClick={() => loadReceipt(payment.id)}>{receiptLoadingId === payment.id ? "Loading…" : "Receipt"}</Button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {payments.map((payment) => (
              <article key={payment.id} className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-all text-sm font-semibold text-slate-800">{payment.transactionId || "Transaction pending"}</p>
                  <Badge tone={paymentStatusTone(payment.status)}>{readablePaymentValue(payment.status)}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-slate-500">Date</dt><dd className="mt-1 text-slate-700">{displayPaymentDate(payment.paidAt || payment.createdAt)}</dd></div>
                  <div><dt className="text-slate-500">Method</dt><dd className="mt-1 text-slate-700">{readablePaymentValue(payment.paymentMethod)}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Amount</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{formatPaise(payment.amountPaise)}</dd></div>
                </dl>
                {payment.status === "SUCCESS" && <Button variant="secondary" size="sm" disabled={receiptLoadingId === payment.id} onClick={() => loadReceipt(payment.id)}>{receiptLoadingId === payment.id ? "Loading receipt…" : "View receipt"}</Button>}
              </article>
            ))}
          </div>
        </>
      )}
      {receiptError && <p role="alert" className="border-t border-rose-100 px-5 py-3 text-sm text-rose-700">{receiptError}</p>}
      <ReceiptView receipt={receipt} onClose={() => setReceipt(null)} />
    </section>
  );
}

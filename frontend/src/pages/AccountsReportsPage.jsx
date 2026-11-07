import { useEffect, useMemo, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { downloadTallyCsv, getAccountsReport, getAccountsReportOptions, getReceiptConfiguration } from "../auth/financialApi.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Input } from "../components/ui/Input.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { Select } from "../components/ui/Select.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";

const tabs = [
  { id: "fee-collection", label: "Fee collection" },
  { id: "payment-collections", label: "Payment collections" },
  { id: "outstanding-dues", label: "Outstanding dues" },
  { id: "refunds", label: "Refunds" },
];
const money = (paise = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
const day = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "—";
const errorMessage = (error) => error.response?.data?.message || error.message || "Please try again.";

function ReportTable({ columns, rows, emptyTitle = "No report rows" }) {
  if (!rows?.length) return <EmptyState title={emptyTitle} description="No records match the selected filters." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={String(row.id ?? row._id ?? row.date ?? row._id ?? index)}>{columns.map((column) => <td key={column.key} className="px-4 py-3.5">{column.render ? column.render(row) : (row[column.key] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}

function Pager({ value, onChange }) {
  if (!value || value.pages <= 1) return null;
  return <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm"><span>Page {value.page} of {value.pages} · {value.total} records</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={value.page <= 1} onClick={() => onChange(value.page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={value.page >= value.pages} onClick={() => onChange(value.page + 1)}>Next</Button></div></div>;
}

export function AccountsReportsPage() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState("fee-collection");
  const [filters, setFilters] = useState({ centreId: "", batchId: "", startDate: "", endDate: "", paymentMethod: "", page: 1, limit: 25 });
  const [options, setOptions] = useState({ centres: [], batches: [] });
  const [configuration, setConfiguration] = useState(null);
  const [data, setData] = useState(null); const [state, setState] = useState("loading"); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState(""); const [exportMessage, setExportMessage] = useState("");
  const reportFilters = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")), [filters]);
  const batches = options.batches.filter((batch) => !filters.centreId || String(batch.centre) === filters.centreId);
  useEffect(() => {
    const controller = new AbortController();
    getAccountsReportOptions({ accessToken, signal: controller.signal }).then((response) => setOptions(response.data ?? { centres: [], batches: [] })).catch(() => {});
    getReceiptConfiguration({ accessToken, signal: controller.signal }).then((response) => setConfiguration(response.data)).catch((err) => setExportError(errorMessage(err)));
    return () => controller.abort();
  }, [accessToken]);
  useEffect(() => {
    const controller = new AbortController(); setState("loading"); setData(null); setError("");
    getAccountsReport({ report: tab, filters: reportFilters, accessToken, signal: controller.signal }).then((response) => {
      if (!response?.success || !response.data) throw new Error("The report API returned an unexpected response.");
      setData(response.data); setState("success");
    }).catch((err) => { if (!controller.signal.aborted) { setError(errorMessage(err)); setState("error"); } });
    return () => controller.abort();
  }, [accessToken, tab, reportFilters, retry]);
  const update = (name, value) => setFilters((current) => ({ ...current, [name]: value, page: 1, ...(name === "centreId" ? { batchId: "" } : {}) }));
  const doExport = async () => {
    setExporting(true); setExportError(""); setExportMessage("");
    try {
      const result = await downloadTallyCsv({ filters: reportFilters, accessToken });
      const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `coachify-tally-export-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setExportMessage(`CSV downloaded${result.exportId ? ` · export ${result.exportId}` : ""}. Use source_record_id to detect rows already imported.`);
    } catch (err) { setExportError(errorMessage(err)); } finally { setExporting(false); }
  };
  const pagination = data?.pagination;
  return <>
    <PageHeader eyebrow="Accounts" title="Financial reports" description="Review collections, balances, dues, and refunds across your assigned centres." action={<Button disabled={exporting} onClick={doExport}><Download size={16} className="mr-2" />{exporting ? "Preparing CSV…" : "Export Tally CSV"}</Button>} />
    <section className="mb-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select label="Centre" value={filters.centreId} onChange={(event) => update("centreId", event.target.value)}><option value="">All assigned centres</option>{options.centres.map((centre) => <option key={centre._id} value={centre._id}>{centre.name} · {centre.code}</option>)}</Select>
        <Select label="Batch" value={filters.batchId} onChange={(event) => update("batchId", event.target.value)}><option value="">All batches</option>{batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name} · {batch.course}</option>)}</Select>
        <Input label="Start date" type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)} />
        <Input label="End date" type="date" value={filters.endDate} onChange={(event) => update("endDate", event.target.value)} />
        <Select label="Payment method" value={filters.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}><option value="">All methods</option>{["GATEWAY", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</Select>
      </div>
      {(exportError || exportMessage) && <p role={exportError ? "alert" : "status"} className={`mt-3 text-sm ${exportError ? "text-rose-700" : "text-emerald-700"}`}>{exportError || exportMessage}</p>}
    </section>
    <section className="mb-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3"><FileBarChart size={18} className="mt-1 text-brand-700" /><div className="min-w-0"><h2 className="font-semibold text-slate-900">Receipt and GST configuration</h2>{configuration ? <p className="mt-1 text-sm text-slate-600">{configuration.institute.name ? `${configuration.institute.name} · ${configuration.institute.address}` : "Institute name/address are not configured; receipt generation requires INSTITUTE_NAME and INSTITUTE_ADDRESS."} <Badge tone={configuration.gst.taxability === "NOT_CONFIGURED" ? "warning" : "info"}>{configuration.gst.taxability.replaceAll("_", " ")}</Badge>{configuration.gst.taxability === "TAXABLE" && ` · ${(configuration.gst.rateBps / 100).toFixed(2)}% ${configuration.gst.treatment}`}</p> : <p className="mt-1 text-sm text-slate-500">Receipt/GST settings could not be loaded.</p>}</div></div>
    </section>
    <div role="tablist" aria-label="Financial report type" className="mb-4 flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setFilters((current) => ({ ...current, page: 1 })); }} className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-semibold transition ${tab === item.id ? "bg-brand-700 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>)}</div>
    {state === "loading" && <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><LoadingState label="Loading report" /></section>}
    {state === "error" && <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><ErrorState title="Couldn’t load report" description={error} onRetry={() => setRetry((value) => value + 1)} /></section>}
    {state === "success" && tab === "fee-collection" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total billed" value={money(data.financialSummary?.totalBilledPaise)} />
      <StatCard label="Total collected" value={money(data.financialSummary?.totalCollectedPaise)} />
      <StatCard label="Outstanding balance" value={money(data.financialSummary?.totalOutstandingPaise)} />
      <StatCard label="Overdue amount" value={money(data.financialSummary?.totalOverduePaise)} />
      <section className="sm:col-span-2 xl:col-span-4 rounded-xl border border-slate-200/80 bg-white shadow-card"><ReportTable columns={[{ key: "centreName", label: "Centre" }, { key: "totalBilledPaise", label: "Billed", render: (row) => money(row.totalBilledPaise) }, { key: "totalCollectedPaise", label: "Collected", render: (row) => money(row.totalCollectedPaise) }, { key: "outstandingPaise", label: "Outstanding", render: (row) => money(row.outstandingPaise) }, { key: "overduePaise", label: "Overdue", render: (row) => money(row.overduePaise) }]} rows={data.centreWiseCollection ?? []} emptyTitle="No billed fees found" /></section>
      <p className="sm:col-span-2 xl:col-span-4 text-xs leading-5 text-slate-500">Fee totals reuse the Accounts dashboard ledger calculation. Date filters apply to fee plan creation dates; collected amounts include successful payments for those plans.</p>
    </div>}
    {state === "success" && tab === "payment-collections" && <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card"><div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2"><StatCard label="Successful collection" value={money(data.totals?.totalCollectedPaise)} /><StatCard label="Successful payments" value={data.totals?.paymentCount ?? 0} /></div><div className="grid gap-5 p-4 xl:grid-cols-2"><div><h3 className="mb-2 font-semibold">By payment date (UTC)</h3><ReportTable columns={[{ key: "_id", label: "Date" }, { key: "amountPaise", label: "Amount", render: (row) => money(row.amountPaise) }, { key: "count", label: "Payments" }]} rows={data.byDate ?? []} /></div><div><h3 className="mb-2 font-semibold">By method</h3><ReportTable columns={[{ key: "_id", label: "Method" }, { key: "amountPaise", label: "Amount", render: (row) => money(row.amountPaise) }, { key: "count", label: "Payments" }]} rows={data.byMethod ?? []} /></div><div><h3 className="mb-2 font-semibold">By centre</h3><ReportTable columns={[{ key: "name", label: "Centre" }, { key: "amountPaise", label: "Amount", render: (row) => money(row.amountPaise) }, { key: "count", label: "Payments" }]} rows={data.byCentre ?? []} /></div><div><h3 className="mb-2 font-semibold">By batch</h3><ReportTable columns={[{ key: "name", label: "Batch" }, { key: "amountPaise", label: "Amount", render: (row) => money(row.amountPaise) }, { key: "count", label: "Payments" }]} rows={data.byBatch ?? []} /></div></div><div className="border-t border-slate-100"><ReportTable columns={[{ key: "paidAt", label: "Date", render: (row) => day(row.paidAt) }, { key: "studentName", label: "Student", render: (row) => <>{row.studentName}<span className="block text-xs text-slate-500">{row.studentId}</span></> }, { key: "centre", label: "Centre / batch", render: (row) => `${row.centre ?? "—"} / ${row.batch ?? "—"}` }, { key: "paymentMethod", label: "Method" }, { key: "amountPaise", label: "Amount", render: (row) => money(row.amountPaise) }]} rows={data.payments ?? []} emptyTitle="No successful payments" /><Pager value={pagination} onChange={(page) => setFilters((current) => ({ ...current, page }))} /></div></section>}
    {state === "success" && tab === "outstanding-dues" && <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card"><div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2"><StatCard label="Outstanding" value={money(data.totals?.outstandingPaise)} /><StatCard label="Overdue" value={money(data.totals?.overduePaise)} /></div><ReportTable columns={[{ key: "studentName", label: "Student", render: (row) => <>{row.studentName}<span className="block text-xs text-slate-500">{row.studentId}</span></> }, { key: "centreName", label: "Centre / batch", render: (row) => `${row.centreName ?? "—"} / ${row.batchName ?? "—"}` }, { key: "instalmentNumber", label: "Instalment" }, { key: "instalmentAmountPaise", label: "Amount", render: (row) => money(row.instalmentAmountPaise) }, { key: "amountPaidPaise", label: "Paid", render: (row) => money(row.amountPaidPaise) }, { key: "outstandingPaise", label: "Outstanding", render: (row) => money(row.outstandingPaise) }, { key: "dueDate", label: "Due date", render: (row) => day(row.dueDate) }, { key: "daysOverdue", label: "Days overdue" }]} rows={data.dues ?? []} emptyTitle="No outstanding dues" /><Pager value={pagination} onChange={(page) => setFilters((current) => ({ ...current, page }))} /></section>}
    {state === "success" && tab === "refunds" && <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card"><div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Approved amount" value={money(data.totals?.approvedAmountPaise)} /><StatCard label="Processed amount" value={money(data.totals?.processedAmountPaise)} /><StatCard label="Rejected amount" value={money(data.totals?.rejectedAmountPaise)} /><StatCard label="Pending requests" value={data.totals?.pendingCount ?? 0} /><StatCard label="Rejected requests" value={data.totals?.rejectedCount ?? 0} /></div><ReportTable columns={[{ key: "studentName", label: "Student", render: (row) => <>{row.studentName}<span className="block text-xs text-slate-500">{row.studentId}</span></> }, { key: "centreName", label: "Centre / batch", render: (row) => `${row.centreName ?? "—"} / ${row.batchName ?? "—"}` }, { key: "withdrawalDate", label: "Withdrawal", render: (row) => day(row.withdrawalDate) }, { key: "refundAmountPaise", label: "Refund amount", render: (row) => money(row.refundAmountPaise) }, { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "PROCESSED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>{row.status}</Badge> }, { key: "createdAt", label: "Requested", render: (row) => day(row.createdAt) }, { key: "processedAt", label: "Processed", render: (row) => day(row.processedAt) }]} rows={data.refunds ?? []} emptyTitle="No refund requests" /><Pager value={pagination} onChange={(page) => setFilters((current) => ({ ...current, page }))} /></section>}
  </>;
}

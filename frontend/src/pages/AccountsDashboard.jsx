import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  FilterX,
  IndianRupee,
  RotateCw,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext.jsx";
import { getAccountsDashboard } from "../auth/api.js";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { Select } from "../components/ui/Select.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";

const EMPTY_FILTERS = { centreId: "", batchId: "", startDate: "", endDate: "" };
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const compactINR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatPaise = (paise = 0) => INR.format(paise / 100);
const formatCompactPaise = (paise = 0) => compactINR.format(paise / 100);
const getErrorMessage = (error) =>
  error.response?.data?.message || error.message || "Please try again in a moment.";

function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading accounts dashboard" className="space-y-6">
      <span className="sr-only">Loading accounts dashboard…</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="h-4 w-28 rounded bg-slate-100" />
            <div className="mt-5 h-7 w-32 rounded bg-slate-100" />
            <div className="mt-3 h-3 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="h-5 w-44 rounded bg-slate-100" />
            <div className="mt-6 h-64 rounded-lg bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, description, children, className = "" }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 ${className}`}>
      <div className="mb-5">
        <h2 className="font-display text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function INRTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-floating">
      {label && <p className="mb-1.5 text-xs font-semibold text-slate-700">{label}</p>}
      {payload.map((item) => (
        <p key={item.dataKey} className="text-xs leading-5" style={{ color: item.color }}>
          {item.name}: <span className="font-semibold">{formatPaise(item.value)}</span>
        </p>
      ))}
    </div>
  );
}

function ChartEmpty({ message = "No data for this selection." }) {
  return (
    <div className="grid h-64 place-items-center rounded-lg bg-slate-50/70 px-4 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function DashboardFilters({
  values,
  centres,
  batches,
  hasCentreOptions,
  hasBatchOptions,
  batchOptionsReady,
  onChange,
  onApply,
  onClear,
  busy,
  dirty,
  error,
}) {
  return (
    <form onSubmit={onApply} className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700"><CalendarDays size={16} /></span>
          <h2 className="text-sm font-bold text-slate-800">Dashboard filters</h2>
        </div>
        <p className="text-xs text-slate-500">Date range filters fee plans by creation date.</p>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
        <Select id="dashboard-centre" label="Centre" value={values.centreId} onChange={(event) => onChange("centreId", event.target.value)} disabled={busy}>
          <option value="">All accessible centres</option>
          {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.centreName}</option>)}
        </Select>
        <Select
          id="dashboard-batch"
          label="Batch"
          value={values.batchId}
          disabled={busy || !batchOptionsReady || !hasBatchOptions}
          onChange={(event) => onChange("batchId", event.target.value)}
        >
          <option value="">{values.centreId ? "All batches at this centre" : "Choose a centre first"}</option>
          {batches.map((batch) => (
            <option key={batch.batchId} value={batch.batchId}>
              {[batch.batchName, batch.course].filter(Boolean).join(" · ")}
            </option>
          ))}
        </Select>
        <div className="w-full">
          <label htmlFor="dashboard-start-date" className="mb-1.5 block text-sm font-semibold text-slate-700">Start date</label>
          <input id="dashboard-start-date" type="date" value={values.startDate} onChange={(event) => onChange("startDate", event.target.value)} disabled={busy} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50" />
        </div>
        <div className="w-full">
          <label htmlFor="dashboard-end-date" className="mb-1.5 block text-sm font-semibold text-slate-700">End date</label>
          <input id="dashboard-end-date" type="date" value={values.endDate} onChange={(event) => onChange("endDate", event.target.value)} disabled={busy} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50" />
        </div>
        <Button type="submit" className="w-full sm:w-auto" loading={busy}>Apply filters</Button>
        <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClear} disabled={busy}>
          <FilterX size={15} />Clear
        </Button>
      </div>
      {(!hasCentreOptions || !hasBatchOptions) && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {!hasCentreOptions
            ? "Centre filter options appear when the API returns fee-plan data."
            : "No batch options were returned for this centre."}
        </p>
      )}
      {dirty && (
        <p role="status" className="mt-3 text-xs font-medium text-brand-700">
          Filters changed. Dashboard totals still reflect the last applied selection until you apply these changes.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
    </form>
  );
}

export function AccountsDashboard() {
  const { accessToken, user } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [result, setResult] = useState(null);
  const [centreOptions, setCentreOptions] = useState([]);
  const [batchOptions, setBatchOptions] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [retryIndex, setRetryIndex] = useState(0);

  const query = useMemo(() => Object.fromEntries(
    Object.entries(appliedFilters).filter(([, value]) => value),
  ), [appliedFilters]);
  const filtersDirty = Object.keys(EMPTY_FILTERS).some((key) => filters[key] !== appliedFilters[key]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setResult(null);
    setError("");

    getAccountsDashboard({ filters: query, accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !response.data?.financialSummary || !response.data?.ageingAnalysis) {
          throw new Error("The dashboard API returned an unexpected response.");
        }
        setResult(response.data);
        if (!query.centreId && response.data.centreWiseCollection?.length) {
          setCentreOptions(response.data.centreWiseCollection);
        }
        setBatchOptions(response.data.batchWiseOutstanding ?? []);
        setStatus("success");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(getErrorMessage(requestError));
        setStatus("error");
      });

    return () => controller.abort();
  }, [accessToken, query, retryIndex]);

  const centres = result?.centreWiseCollection ?? [];
  const batches = result?.batchWiseOutstanding ?? [];
  const summary = result?.financialSummary;
  const ageing = result?.ageingAnalysis;

  const hasData = Boolean(
    summary && (
      summary.totalBilledPaise > 0 ||
      summary.totalCollectedPaise > 0 ||
      centres.length > 0 ||
      batches.length > 0
    ),
  );

  const handleFilterChange = (name, value) => {
    setFilterError("");
    setFilters((current) => {
      if (name === "centreId") return { ...current, centreId: value, batchId: "" };
      return { ...current, [name]: value };
    });
  };

  const handleApply = (event) => {
    event.preventDefault();
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      setFilterError("Start date must be on or before end date.");
      return;
    }
    if (filters.batchId && !filters.centreId) {
      setFilterError("Choose a centre before selecting a batch.");
      return;
    }
    setFilterError("");
    setAppliedFilters({ ...filters });
  };

  const handleClear = () => {
    setFilterError("");
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const retry = useCallback(() => setRetryIndex((index) => index + 1), []);

  const centreChartData = centres.map((item) => ({
    name: item.centreName,
    collected: item.totalCollectedPaise,
    outstanding: item.outstandingPaise,
  }));
  const batchChartData = batches.map((item) => ({
    name: item.batchName,
    course: item.course,
    outstanding: item.outstandingPaise,
  }));
  const ageingChartData = [
    { name: "0–30 days", amount: ageing?.["0To30DaysPaise"] ?? 0 },
    { name: "31–60 days", amount: ageing?.["31To60DaysPaise"] ?? 0 },
    { name: "60+ days", amount: ageing?.["60PlusDaysPaise"] ?? 0 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Overview"
        description={`Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Here’s your fee collection at a glance.`}
        action={<Badge tone="info">Live data</Badge>}
      />
      <DashboardFilters
        values={filters}
        centres={centreOptions}
        batches={batchOptions}
        hasCentreOptions={centreOptions.length > 0}
        hasBatchOptions={batchOptions.length > 0}
        batchOptionsReady={Boolean(filters.centreId && filters.centreId === appliedFilters.centreId)}
        onChange={handleFilterChange}
        onApply={handleApply}
        onClear={handleClear}
        busy={status === "loading"}
        dirty={filtersDirty}
        error={filterError}
      />

      {status === "loading" && <DashboardLoading />}
      {status === "error" && (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-card">
          <ErrorState
            title="Dashboard data is unavailable"
            description={error}
            onRetry={retry}
          />
        </div>
      )}
      {status === "success" && result && (
        <>
          <section aria-label="Financial summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total billed" value={formatPaise(summary.totalBilledPaise)} note="Fee plans in this view" icon={CircleDollarSign} />
            <StatCard label="Total collected" value={formatPaise(summary.totalCollectedPaise)} note="Successful payments" icon={Wallet} tone="green" />
            <StatCard label="Total outstanding" value={formatPaise(summary.totalOutstandingPaise)} note="Unpaid balance" icon={IndianRupee} tone="amber" />
            <StatCard label="Total overdue" value={formatPaise(summary.totalOverduePaise)} note="Past-due unpaid balance" icon={AlertTriangle} tone="amber" />
            <StatCard label="Collection rate" value={`${Number(summary.collectionPercentage).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`} note="Collected against billed" icon={Activity} />
          </section>

          {!hasData ? (
            <section className="mt-5 rounded-xl border border-slate-200/80 bg-white shadow-card">
              <EmptyState
                title="No fee plans match these filters"
                description="Try a different centre, batch, or date range. Date filters apply to the fee plan creation date."
                action={<Button variant="secondary" onClick={handleClear}>Clear filters</Button>}
              />
            </section>
          ) : (
            <section aria-label="Financial analytics" className="mt-5 grid gap-5 xl:grid-cols-2">
              <ChartCard title="Centre-wise collection" description="Successful collections compared with unpaid balances, by centre.">
                {centreChartData.length ? (
                  <div role="img" aria-label="Bar chart comparing collected and outstanding amounts for each centre" className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={centreChartData} margin={{ top: 4, right: 12, left: 4, bottom: 4 }} barGap={5}>
                        <CartesianGrid stroke="#edf0f5" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#748096", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={formatCompactPaise} tick={{ fill: "#748096", fontSize: 10 }} axisLine={false} tickLine={false} width={66} />
                        <Tooltip content={<INRTooltip />} cursor={{ fill: "#f5f7fb" }} />
                        <Bar name="Collected" dataKey="collected" fill="#526fe5" radius={[4, 4, 0, 0]} maxBarSize={38} />
                        <Bar name="Outstanding" dataKey="outstanding" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={38} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <ChartEmpty />}
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2"><i className="size-2 rounded-sm bg-brand-500" />Collected</span>
                  <span className="inline-flex items-center gap-2"><i className="size-2 rounded-sm bg-slate-300" />Outstanding</span>
                </div>
              </ChartCard>

              <ChartCard title="Batch-wise outstanding" description="Remaining unpaid fee by batch.">
                {batchChartData.length ? (
                  <div role="img" aria-label="Horizontal bar chart of outstanding amounts by batch" className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={batchChartData} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke="#edf0f5" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatCompactPaise} tick={{ fill: "#748096", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={112} tick={{ fill: "#5b667b", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<INRTooltip />} cursor={{ fill: "#f5f7fb" }} />
                        <Bar name="Outstanding" dataKey="outstanding" fill="#526fe5" radius={[0, 4, 4, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <ChartEmpty />}
              </ChartCard>

              <ChartCard
                title="Overdue ageing"
                description="Unpaid instalments grouped by days past due, as of today."
                className="xl:col-span-2"
              >
                <div role="img" aria-label="Bar chart of overdue balances aged 0 to 30, 31 to 60, and over 60 days" className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageingChartData} margin={{ top: 8, right: 18, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="#edf0f5" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#5b667b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={formatCompactPaise} tick={{ fill: "#748096", fontSize: 10 }} axisLine={false} tickLine={false} width={66} />
                      <Tooltip content={<INRTooltip />} cursor={{ fill: "#f5f7fb" }} />
                      <Bar name="Overdue balance" dataKey="amount" fill="#e7a64b" radius={[5, 5, 0, 0]} maxBarSize={64} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </section>
          )}

          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <RotateCw aria-hidden="true" size={13} className="mt-0.5 shrink-0" />
            Date filters include fee plans created on the selected UTC calendar days. Overdue and ageing balances are current as of today.
          </p>
        </>
      )}
    </>
  );
}

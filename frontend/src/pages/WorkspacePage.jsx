import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { getNavigationForRole, roleLabels } from "../navigation.js";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState } from "../components/ui/States.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { LoadingState } from "../components/ui/States.jsx";
import { ParentStudentsProvider } from "../auth/ParentStudentsContext.jsx";
import { ParentStudentSelector } from "../components/ParentStudentSelector.jsx";

const AccountsDashboard = lazy(() =>
  import("./AccountsDashboard.jsx").then((module) => ({ default: module.AccountsDashboard })),
);
const AccountsReportsPage = lazy(() =>
  import("./AccountsReportsPage.jsx").then((module) => ({ default: module.AccountsReportsPage })),
);
const StudentManagementPage = lazy(() =>
  import("./StudentManagementPage.jsx").then((module) => ({ default: module.StudentManagementPage })),
);
const AccountsPaymentsPage = lazy(() =>
  import("./PaymentManagementPage.jsx").then((module) => ({ default: module.AccountsPaymentsPage })),
);
const ParentPaymentsPage = lazy(() =>
  import("./PaymentManagementPage.jsx").then((module) => ({ default: module.ParentPaymentsPage })),
);
const AccountsRefundsPage = lazy(() =>
  import("./RefundManagementPage.jsx").then((module) => ({ default: module.AccountsRefundsPage })),
);
const ParentRefundsPage = lazy(() =>
  import("./RefundManagementPage.jsx").then((module) => ({ default: module.ParentRefundsPage })),
);
const AccountsAcademicRecordsPage = lazy(() =>
  import("./AcademicRecordsPage.jsx").then((module) => ({ default: module.AccountsAcademicRecordsPage })),
);
const ParentAttendancePage = lazy(() =>
  import("./AcademicRecordsPage.jsx").then((module) => ({ default: module.ParentAttendancePage })),
);
const ParentTestResultsPage = lazy(() =>
  import("./AcademicRecordsPage.jsx").then((module) => ({ default: module.ParentTestResultsPage })),
);
const ParentDashboard = lazy(() =>
  import("./ParentDashboard.jsx").then((module) => ({ default: module.ParentDashboard })),
);
const ParentReceiptsPage = lazy(() =>
  import("./ParentReceiptsPage.jsx").then((module) => ({ default: module.ParentReceiptsPage })),
);
const ParentRemindersPage = lazy(() =>
  import("./ReminderNotificationsPage.jsx").then((module) => ({ default: module.ParentRemindersPage })),
);
const AccountsRemindersPage = lazy(() =>
  import("./ReminderNotificationsPage.jsx").then((module) => ({ default: module.AccountsRemindersPage })),
);
const AccountsRiskManagementPage = lazy(() =>
  import("./RiskManagementPage.jsx").then((module) => ({ default: module.AccountsRiskManagementPage })),
);
const CounsellorRiskTasksPage = lazy(() =>
  import("./RiskManagementPage.jsx").then((module) => ({ default: module.CounsellorRiskTasksPage })),
);

function getCurrentPage(items, pathname) {
  return [...items].sort((a, b) => b.path.length - a.path.length).find((item) =>
    item.path === pathname || (item.path !== `/${pathname.split("/")[1]}` && pathname.startsWith(`${item.path}/`)),
  ) ?? items[0];
}

function WorkspaceContent() {
  const { user } = useAuth();
  const location = useLocation();
  const items = getNavigationForRole(user?.role);
  const page = getCurrentPage(items, location.pathname);
  const isOverview = page?.path === `/${user?.role?.toLowerCase()}`;

  if (user?.role === "ACCOUNTS" && isOverview) {
    return (
      <Suspense fallback={<LoadingState label="Loading dashboard" />}>
        <AccountsDashboard />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && page?.path === "/accounts/reports") {
    return (
      <Suspense fallback={<LoadingState label="Loading financial reports" />}>
        <AccountsReportsPage />
      </Suspense>
    );
  }

  if (user?.role === "PARENT" && isOverview) {
    return (
      <Suspense fallback={<LoadingState label="Loading parent dashboard" />}>
        <ParentDashboard />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && page?.path === "/accounts/students") {
    return (
      <Suspense fallback={<LoadingState label="Loading student management" />}>
        <StudentManagementPage />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && page?.path === "/accounts/payments") {
    return (
      <Suspense fallback={<LoadingState label="Loading payments" />}>
        <AccountsPaymentsPage />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && page?.path === "/accounts/refunds") {
    return (
      <Suspense fallback={<LoadingState label="Loading refunds" />}>
        <AccountsRefundsPage />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && ["/accounts/attendance", "/accounts/test-results"].includes(page?.path)) {
    return (
      <Suspense fallback={<LoadingState label="Loading academic records" />}>
        <AccountsAcademicRecordsPage initialTab={page.path === "/accounts/test-results" ? "tests" : "attendance"} />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && page?.path === "/accounts/reminders") {
    return (
      <Suspense fallback={<LoadingState label="Loading reminder history" />}>
        <AccountsRemindersPage />
      </Suspense>
    );
  }

  if (user?.role === "ACCOUNTS" && page?.path === "/accounts/risk-management") {
    return (
      <Suspense fallback={<LoadingState label="Loading risk management" />}>
        <AccountsRiskManagementPage />
      </Suspense>
    );
  }

  if (user?.role === "COUNSELLOR" && page?.path === "/counsellor/follow-up-tasks") {
    return (
      <Suspense fallback={<LoadingState label="Loading follow-up tasks" />}>
        <CounsellorRiskTasksPage />
      </Suspense>
    );
  }

  if (user?.role === "COUNSELLOR" && page?.path === "/counsellor/student-risk") {
    return <Navigate to="/counsellor/follow-up-tasks" replace />;
  }

  if (user?.role === "PARENT" && page?.path === "/parent/notifications") {
    return (
      <Suspense fallback={<LoadingState label="Loading fee notifications" />}>
        <ParentRemindersPage />
      </Suspense>
    );
  }

  if (user?.role === "PARENT" && page?.path === "/parent/receipts") {
    return (
      <Suspense fallback={<LoadingState label="Loading receipts" />}>
        <ParentReceiptsPage />
      </Suspense>
    );
  }

  if (user?.role === "PARENT" && page?.path === "/parent/attendance") {
    return (
      <Suspense fallback={<LoadingState label="Loading attendance" />}>
        <ParentAttendancePage />
      </Suspense>
    );
  }

  if (user?.role === "PARENT" && page?.path === "/parent/test-results") {
    return (
      <Suspense fallback={<LoadingState label="Loading test results" />}>
        <ParentTestResultsPage />
      </Suspense>
    );
  }

  if (user?.role === "PARENT" && page?.path === "/parent/refunds") {
    return (
      <Suspense fallback={<LoadingState label="Loading refund requests" />}>
        <ParentRefundsPage />
      </Suspense>
    );
  }

  if (user?.role === "PARENT" && ["/parent/fee-details", "/parent/payment-history"].includes(page?.path)) {
    return (
      <Suspense fallback={<LoadingState label="Loading fee details" />}>
        <ParentPaymentsPage />
      </Suspense>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={roleLabels[user?.role]}
        title={page?.label ?? "Workspace"}
        description={isOverview ? `Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Your workspace is ready to take shape.` : `Your ${page?.label?.toLowerCase() ?? "workspace"} space, designed to keep everything clear and easy to find.`}
        action={<Badge tone="info">Foundation</Badge>}
      />
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        {isOverview ? (
          <div className="relative px-6 py-9 sm:px-9 sm:py-11">
            <div className="absolute -right-10 -top-16 size-64 rounded-full border-[34px] border-brand-50/70" />
            <div className="relative max-w-2xl">
              <span className="mb-5 inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Sparkles size={18} /></span>
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-brand-600">Your Coachify workspace</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[30px]">The foundation is in place.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">This workspace is ready for your institute’s day-to-day tools. We’re keeping this first release focused on a clear, secure foundation — no sample figures or placeholder business data.</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {items.slice(1, 4).map((item) => (
                  <span key={item.path} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                    <item.icon size={14} className="text-slate-400" />{item.label}<ArrowUpRight size={12} className="text-slate-300" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title={`${page?.label ?? "This page"} is ready for what’s next`} description="This release establishes the navigation and page foundation. Business workflows will be added in a later module." />
        )}
      </section>
      <p className="mt-5 text-center text-xs text-slate-400">Coachify · A clearer way to move learning forward</p>
    </>
  );
}

export function WorkspacePage() {
  const { user } = useAuth();
  if (user?.role !== "PARENT") return <WorkspaceContent />;
  return (
    <ParentStudentsProvider>
      <div className="min-w-0">
        <ParentStudentSelector />
        <WorkspaceContent />
      </div>
    </ParentStudentsProvider>
  );
}

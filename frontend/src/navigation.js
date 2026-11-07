import {
  Activity,
  BookOpenCheck,
  Bell,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldAlert,
  Users,
  WalletCards,
} from "lucide-react";

export const roleHome = (role) => {
  if (role === "PARENT") return "/parent";
  if (role === "COUNSELLOR") return "/counsellor";
  if (role === "ACCOUNTS") return "/accounts";
  return "/login";
};

const accountsItems = [
  { label: "Overview", path: "/accounts", icon: LayoutDashboard },
  { label: "Students", path: "/accounts/students", icon: Users },
  { label: "Fee Management", path: "/accounts/fee-management", icon: CircleDollarSign },
  { label: "Payments", path: "/accounts/payments", icon: WalletCards },
  { label: "Refunds", path: "/accounts/refunds", icon: FileClock },
  { label: "Attendance", path: "/accounts/attendance", icon: Activity },
  { label: "Test Results", path: "/accounts/test-results", icon: BookOpenCheck },
  { label: "Reminders", path: "/accounts/reminders", icon: Bell },
  { label: "Risk Management", path: "/accounts/risk-management", icon: ShieldAlert },
  { label: "Reports", path: "/accounts/reports", icon: ClipboardList },
  { label: "Settings", path: "/accounts/settings", icon: Settings },
];

const parentItems = [
  { label: "Overview", path: "/parent", icon: LayoutDashboard },
  { label: "Fee Details", path: "/parent/fee-details", icon: CircleDollarSign },
  { label: "Payment History", path: "/parent/payment-history", icon: WalletCards },
  { label: "Refunds", path: "/parent/refunds", icon: FileClock },
  { label: "Receipts", path: "/parent/receipts", icon: FileText },
  { label: "Attendance", path: "/parent/attendance", icon: Activity },
  { label: "Test Results", path: "/parent/test-results", icon: BookOpenCheck },
  { label: "Notifications", path: "/parent/notifications", icon: Bell },
];

const counsellorItems = [
  { label: "Overview", path: "/counsellor", icon: LayoutDashboard },
  { label: "Follow-up Tasks", path: "/counsellor/follow-up-tasks", icon: ClipboardList },
  { label: "Student Risk", path: "/counsellor/student-risk", icon: ShieldAlert },
];

export const navigationByRole = {
  ACCOUNTS: accountsItems,
  PARENT: parentItems,
  COUNSELLOR: counsellorItems,
};

export const roleLabels = {
  ACCOUNTS: "Accounts",
  PARENT: "Parent portal",
  COUNSELLOR: "Counsellor",
};

export const getNavigationForRole = (role) => navigationByRole[role] ?? [];
export const supportNavItem = { label: "Help & support", path: "#", icon: LifeBuoy };
export const brandIcon = GraduationCap;

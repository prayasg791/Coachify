import { Bell, LogOut, Menu, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { roleLabels } from "../../navigation.js";

export function Topbar({ onMenuClick }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const notificationPath = user?.role === "PARENT" ? "/parent/notifications" : "/accounts/reminders";
  const name = user?.name || "Your account";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-9">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onMenuClick} aria-label="Open navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu size={20} /></button>
        <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:flex md:w-64">
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <span className="text-xs text-slate-400">Search your workspace</span>
          <kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">⌘ K</kbd>
        </div>
        <span className="truncate text-sm font-semibold text-slate-700 md:hidden">Workspace</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {["PARENT", "ACCOUNTS"].includes(user?.role) && (
          <Link to={notificationPath} aria-label={user?.role === "PARENT" ? "Fee notifications" : "Reminder history"} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100">
            <Bell size={18} />
          </Link>
        )}
        <span className="hidden h-8 w-px bg-slate-200 sm:block" />
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials}</span>
          <div className="hidden min-w-0 sm:block">
            <p className="max-w-36 truncate text-xs font-bold text-slate-800">{name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{roleLabels[user?.role] ?? "User"}</p>
          </div>
          <button type="button" aria-label="Sign out" title="Sign out" onClick={() => { signOut(); navigate("/login", { replace: true }); }} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

import { NavLink } from "react-router-dom";
import { ArrowUpRight, GraduationCap, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { getNavigationForRole, roleLabels, supportNavItem } from "../../navigation.js";

export function Sidebar({ role, open, onClose, collapsed = false, onToggleCollapse }) {
  const items = getNavigationForRole(role);
  const label = roleLabels[role] ?? "Workspace";
  return (
    <>
      {open && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-[76px]" : "lg:w-[264px]"}`}>
        <div className={`flex h-[72px] items-center border-b border-slate-100 px-5 ${collapsed ? "lg:justify-center lg:px-0" : "justify-between"}`}>
          <a href="#" onClick={(event) => event.preventDefault()} aria-label="Coachify home" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white shadow-sm"><GraduationCap size={20} /></span>
            {!collapsed && <span className="font-display text-[19px] font-extrabold tracking-tight text-slate-900">coachify<span className="text-brand-600">.</span></span>}
          </a>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close sidebar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className={`px-4 pt-6 ${collapsed ? "lg:px-2" : ""}`}>
          {!collapsed && <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Workspace</p>}
          <nav aria-label={`${label} navigation`} className="space-y-1">
            {items.map(({ label: itemLabel, path, icon: Icon }) => (
              <NavLink
                key={path}
                end={path === `/${role?.toLowerCase()}`}
                to={path}
                onClick={onClose}
                title={collapsed ? itemLabel : undefined}
                className={({ isActive }) => `group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"} ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
              >
                <Icon aria-hidden="true" size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{itemLabel}</span>}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`mt-4 hidden min-h-9 w-full items-center gap-3 rounded-lg px-3 text-xs font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 lg:flex ${collapsed ? "justify-center px-0" : ""}`}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span>Collapse sidebar</span></>}
          </button>
        </div>
        {!collapsed && (
          <div className="mt-auto p-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-4">
              <div className="flex items-center justify-between text-brand-700">
                <GraduationCap size={17} />
                <ArrowUpRight size={14} />
              </div>
              <p className="mt-3 text-xs font-bold text-slate-800">Made for better learning</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">A clearer view of your institute, all in one place.</p>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <span className="flex min-h-9 items-center gap-3 rounded-lg px-3 text-xs font-medium text-slate-500"><supportNavItem.icon size={16} />{supportNavItem.label}</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

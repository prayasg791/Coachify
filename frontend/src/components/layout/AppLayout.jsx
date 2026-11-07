import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { Topbar } from "./Topbar.jsx";

export function AppLayout() {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar role={user?.role} open={drawerOpen} onClose={() => setDrawerOpen(false)} collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} />
      <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[264px]"}`}>
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

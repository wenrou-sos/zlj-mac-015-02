import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/Toast.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Tasks from "./pages/Tasks.jsx";
import Abnormals from "./pages/Abnormals.jsx";
import WorkOrders from "./pages/WorkOrders.jsx";
import EquipmentPage from "./pages/Equipment.jsx";
import Downtimes from "./pages/Downtimes.jsx";

const NAV = [
  { to: "/", label: "总览看板", icon: "📊", end: true },
  { to: "/tasks", label: "点检任务", icon: "📝" },
  { to: "/abnormals", label: "异常报告", icon: "⚠️" },
  { to: "/work-orders", label: "维修工单", icon: "🔧" },
  { to: "/equipment", label: "设备台账", icon: "🏭" },
  { to: "/downtimes", label: "停机复机", icon: "⏸️" },
];

export default function App() {
  const location = useLocation();
  return (
    <ToastProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="logo">
            设备点检系统
            <span className="sub">EQUIPMENT INSPECTION</span>
          </div>
          <nav>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="main">
          <header className="topbar">
            <h1>
              {NAV.find((n) =>
                n.end ? location.pathname === "/" : location.pathname.startsWith(n.to)
              )?.label ?? ""}
            </h1>
            <span className="muted">
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
          </header>
          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/abnormals" element={<Abnormals />} />
              <Route path="/work-orders" element={<WorkOrders />} />
              <Route path="/equipment" element={<EquipmentPage />} />
              <Route path="/downtimes" element={<Downtimes />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

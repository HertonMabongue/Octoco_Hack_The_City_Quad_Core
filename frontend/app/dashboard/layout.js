import Sidebar from "../../components/layout/Sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: 24 }}>{children}</div>
    </div>
  );
}

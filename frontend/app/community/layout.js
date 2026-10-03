import Navbar from "../../components/layout/Navbar";

export default function CommunityLayout({ children }) {
  return (
    <div>
      <Navbar />
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}

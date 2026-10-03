import "./globals.css";

export const metadata = {
  title: "River Corridor Dashboard",
  description: "Live telemetry dashboard for sensor nodes",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Clean Corridor",
  description: "Bin overflow and littering monitoring for the Adam Tas Corridor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

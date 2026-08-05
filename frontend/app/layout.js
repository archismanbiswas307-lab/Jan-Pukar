import "./globals.css";
import Nav from "../components/Nav";

export const metadata = {
  title: "JanPukar — AI-Powered Civic Grievance Platform",
  description: "Report municipal issues instantly. AI-powered triage ensures your voice reaches the right team. Track resolution in real-time.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white px-2 py-1 rounded z-[9999]">Skip to content</a>
        <Nav />
        <main id="content" className="flex-1">{children}</main>
      </body>
    </html>
  );
}

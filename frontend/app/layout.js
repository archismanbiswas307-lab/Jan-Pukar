import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "../components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "JanPukar - Citizen Grievance Redressal System",
  description: "A platform for citizens to report grievances and for authorities to address them efficiently.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white px-2 py-1 rounded">Skip to content</a>
        <Nav />
        <main id="content" className="flex-1">{children}</main>
      </body>
    </html>
  );
}

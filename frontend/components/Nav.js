"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/submit", label: "Report Issue" },
  { href: "/track", label: "Track Status" },
  { href: "/admin", label: "Control Room" },
  { href: "/login", label: "Admin Login" },
];

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[999]" style={{
      background: 'rgba(10, 14, 26, 0.75)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group" style={{ textDecoration: 'none' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
            JP
          </div>
          <span className="text-lg font-bold tracking-tight gradient-text">JanPukar</span>
        </Link>

        {/* Desktop Nav */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className="px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      color: isActive ? '#10b981' : '#94a3b8',
                      background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = '#e2e8f0';
                        e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = '#94a3b8';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          style={{ background: mobileOpen ? 'rgba(148, 163, 184, 0.1)' : 'transparent' }}
        >
          <span className="block w-5 h-0.5 rounded-full transition-all duration-300"
            style={{
              background: '#94a3b8',
              transform: mobileOpen ? 'rotate(45deg) translate(2px, 4px)' : 'none',
            }} />
          <span className="block w-5 h-0.5 rounded-full transition-all duration-300"
            style={{
              background: '#94a3b8',
              opacity: mobileOpen ? 0 : 1,
            }} />
          <span className="block w-5 h-0.5 rounded-full transition-all duration-300"
            style={{
              background: '#94a3b8',
              transform: mobileOpen ? 'rotate(-45deg) translate(2px, -4px)' : 'none',
            }} />
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <nav className="md:hidden animate-slide-down" style={{
          borderTop: '1px solid rgba(148, 163, 184, 0.1)',
          background: 'rgba(10, 14, 26, 0.95)',
        }}>
          <ul className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-2.5 rounded-lg text-sm font-medium"
                    style={{
                      color: isActive ? '#10b981' : '#cbd5e1',
                      background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    }}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}

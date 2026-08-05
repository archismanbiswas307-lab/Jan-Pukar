import Link from "next/link";

export default function Nav() {
  return (
    <header className="bg-white/90 backdrop-blur-sm border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-bold">JanPukar</Link>
        </div>

        <nav aria-label="Primary" className="hidden sm:block">
          <ul className="flex items-center gap-4">
            <li><Link href="/submit" className="text-sm text-slate-700 hover:text-slate-900">Submit</Link></li>
            <li><Link href="/track" className="text-sm text-slate-700 hover:text-slate-900">Track</Link></li>
            <li><Link href="/profile" className="text-sm text-slate-700 hover:text-slate-900">Profile</Link></li>
            <li><Link href="/admin" className="text-sm text-slate-700 hover:text-slate-900">Admin</Link></li>
            <li><Link href="/login" className="text-sm text-slate-700 hover:text-slate-900">Login</Link></li>
          </ul>
        </nav>

        <div className="sm:hidden">
          <Link href="/submit" className="text-sm text-slate-700">Submit</Link>
        </div>
      </div>
    </header>
  );
}

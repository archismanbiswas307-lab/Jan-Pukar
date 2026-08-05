"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginClient() {
  const router = useRouter();
  const supabaseClient = supabase;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await supabaseClient.auth.signInWithPassword({ email, password });
      if (res.error) throw res.error;
      router.push("/admin");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded shadow">
      <h2 id="login-title" className="text-xl font-semibold mb-4">Admin Access</h2>
      <p className="text-sm text-gray-600 mb-4">
        Enter the registered administrator email and password to access the admin dashboard.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="login-title">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium">Admin Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            aria-required="true"
            className="mt-1 block w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your admin password"
            className="mt-1 block w-full border rounded px-3 py-2"
            aria-describedby="login-password-desc"
            required
          />
          <div id="login-password-desc" className="text-xs text-gray-500">This system is restricted to administrators only.</div>
        </div>

        {error && <div role="alert" className="text-red-600">{error}</div>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            aria-disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => { setEmail(""); setPassword(""); setError(""); }}
            className="text-sm text-gray-600"
          >
            Clear
          </button>
        </div>
      </form>
      <p className="text-xs text-gray-500 mt-4">Only approved administrators can access this system.</p>
    </div>
  );
}

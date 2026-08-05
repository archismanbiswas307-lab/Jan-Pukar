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
      let res;
      if (password) {
        res = await supabaseClient.auth.signInWithPassword({ email, password });
      } else {
        res = await supabaseClient.auth.signInWithOtp({ email });
      }
      if (res.error) throw res.error;
      router.push("/profile");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded shadow">
      <h2 id="login-title" className="text-xl font-semibold mb-4">Sign in / Sign up</h2>
      <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="login-title">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
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
          <label htmlFor="login-password" className="block text-sm font-medium">Password (optional)</label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="leave empty for magic link"
            className="mt-1 block w-full border rounded px-3 py-2"
            aria-describedby="login-password-desc"
          />
          <div id="login-password-desc" className="sr-only">Leave empty to receive a magic link via email.</div>
        </div>

        {error && <div role="alert" className="text-red-600">{error}</div>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            aria-disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {loading ? "Working…" : "Continue"}
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
      <p className="text-xs text-gray-500 mt-4">You can sign in with password or request a magic link.</p>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (mounted) setSession(currentSession);
    };
    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, updatedSession) => {
      setSession(updatedSession?.session ?? null);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "success", text: "Signed in successfully. You can now return to Submit." });
      }
    } catch (err) {
      console.error("Sign in failed:", err);
      setMessage({ type: "error", text: err.message || "Failed to sign in." });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "success", text: "Account created. Check your email if verification is required." });
      }
    } catch (err) {
      console.error("Sign up failed:", err);
      setMessage({ type: "error", text: err.message || "Failed to sign up." });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMessage({ type: "success", text: "Signed out." });
  };

  return (
    <main className="p-6 max-w-xl mx-auto">
      <div className="space-y-4">
        <div className="bg-slate-900/95 p-5 rounded shadow border border-slate-700">
          <h1 className="text-2xl font-bold text-white">Web Portal Login</h1>
          <p className="mt-2 text-slate-300">Sign in or create an account so your reports are not anonymous.</p>
          {session && (
            <div className="mt-4 rounded border border-emerald-500 bg-emerald-500/10 p-3 text-emerald-100">
              Signed in as <span className="font-semibold">{session.user.email || session.user.id}</span>
              <button type="button" onClick={handleSignOut} className="ml-3 text-emerald-200 underline">Sign out</button>
            </div>
          )}
        </div>

        <form className="space-y-3 bg-slate-800/95 p-5 rounded shadow-lg text-white" onSubmit={handleSignIn}>
          <label className="block text-sm font-medium text-slate-200">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-white"
          />

          <label className="block text-sm font-medium text-slate-200">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a strong password"
            className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-white"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="submit" disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-40">
              {loading ? "Working..." : "Sign In"}
            </button>
            <button type="button" disabled={loading} onClick={handleSignUp} className="rounded border border-slate-600 bg-slate-700 px-4 py-2 text-white disabled:opacity-40">
              {loading ? "Working..." : "Create Account"}
            </button>
          </div>

          {message && (
            <div className={`rounded px-3 py-2 ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {message.text}
            </div>
          )}
        </form>

        <div className="rounded border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
          <p>
            If you want to avoid anonymous submission, sign in here before filing a report. Logged-in submissions will include your portal identity and make later traceability easier.
          </p>
        </div>
      </div>
    </main>
  );
}

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
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="glass-panel animate-fade-in-up" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 id="login-title" style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px' }}>
            Control Room <span className="gradient-text">Login</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Enter your administrator credentials to access the JanPukar dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} aria-labelledby="login-title">
          <div>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Admin Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              aria-required="true"
              className="input-dark"
              placeholder="admin@janpukar.gov"
            />
          </div>

          <div>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-dark"
              aria-describedby="login-password-desc"
              required
            />
          </div>

          {error && (
            <div role="alert" style={{
              padding: '12px 16px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', fontSize: '0.85rem', textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '8px' }}>
            <button
              type="submit"
              disabled={loading}
              aria-disabled={loading}
              className="btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: '1rem', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Authenticating..." : "Sign in to Dashboard"}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '24px' }}>
          This system is restricted to authorized municipal personnel only.
        </p>
      </div>
    </div>
  );
}

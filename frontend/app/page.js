"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, resolved: 0, pending: 0, avgHours: null });
  const [trackingId, setTrackingId] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data, error } = await supabase.from("grievances").select("id, status, created_at, updated_at");
        if (error) throw error;
        const items = data || [];
        const total = items.length;
        const resolved = items.filter(g => (g.status || "").toLowerCase() === "resolved").length;
        const pending = items.filter(g => (g.status || "").toLowerCase() === "pending").length;

        let avgHours = null;
        const resolvedItems = items.filter(g => g.status?.toLowerCase() === "resolved" && g.created_at && g.updated_at);
        if (resolvedItems.length > 0) {
          const diffs = resolvedItems.map(r => (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60));
          avgHours = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
        }

        setStats({ total, resolved, pending, avgHours });
      } catch (err) {
        console.error("Stats fetch error:", err);
      }
    }
    fetchStats();
  }, []);

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setTrackLoading(true);
    setTrackError("");
    try {
      const cleanId = trackingId.trim().replace(/^#/, "");
      const { data, error } = await supabase
        .from("grievances")
        .select("id, tracking_id")
        .or(`tracking_id.eq.${cleanId},id.eq.${cleanId}`)
        .limit(1)
        .single();

      if (error || !data) {
        setTrackError("No report found with that ID");
        return;
      }
      router.push(`/track?id=${encodeURIComponent(cleanId)}`);
    } catch {
      setTrackError("Could not find that report");
    } finally {
      setTrackLoading(false);
    }
  };

  const STEPS = [
    {
      num: "01",
      title: "Report",
      desc: "Submit your issue via web portal or Telegram bot. Drop a photo, pin the location.",
      icon: "📢",
    },
    {
      num: "02",
      title: "AI Triage",
      desc: "Our AI categorizes, scores urgency, and deduplicates reports automatically.",
      icon: "🤖",
    },
    {
      num: "03",
      title: "Resolution",
      desc: "Municipal teams get dispatched. Track your report's journey in real-time.",
      icon: "✅",
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Hero Section */}
      <section style={{
        minHeight: '85vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--gradient-hero)',
      }}>
        {/* Ambient glow orbs */}
        <div style={{
          position: 'absolute', top: '10%', left: '15%',
          width: '400px', height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} className="animate-float" />
        <div style={{
          position: 'absolute', bottom: '15%', right: '10%',
          width: '350px', height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} className="animate-float delay-200" />

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 24px', maxWidth: '800px' }}>
          {/* Badge */}
          <div className="animate-fade-in-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px', borderRadius: '20px', marginBottom: '24px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            fontSize: '0.8rem', fontWeight: 500, color: '#34d399',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
            }} /> AI-Powered Civic Platform
          </div>

          {/* Main Heading */}
          <h1 className="animate-fade-in-up delay-100" style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            fontWeight: 900, lineHeight: 1.1,
            marginBottom: '20px', letterSpacing: '-0.03em',
          }}>
            Your Voice.{' '}
            <span className="gradient-text">Your City.</span>
          </h1>

          <p className="animate-fade-in-up delay-200" style={{
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: 'var(--text-secondary)', maxWidth: '600px',
            margin: '0 auto 36px', lineHeight: 1.7,
          }}>
            Report municipal issues instantly. Our AI triages, deduplicates, and routes
            your complaint to the right team — no app download needed.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-in-up delay-300" style={{
            display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <Link href="/submit" className="btn-primary animate-pulse-glow" style={{
              fontSize: '1.05rem', padding: '14px 36px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}>
              📢 Report an Issue
            </Link>
            <Link href="/admin" className="btn-secondary" style={{ textDecoration: 'none' }}>
              🗺️ View Control Room
            </Link>
          </div>

          {/* Tracking Lookup */}
          <form onSubmit={handleTrack} className="animate-fade-in-up delay-400" style={{
            marginTop: '40px', display: 'flex', gap: '8px',
            maxWidth: '440px', margin: '40px auto 0',
          }}>
            <input
              value={trackingId}
              onChange={(e) => { setTrackingId(e.target.value); setTrackError(""); }}
              placeholder="Enter tracking ID (e.g. G-1024)"
              className="input-dark"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
            />
            <button type="submit" disabled={trackLoading} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
              {trackLoading ? "..." : "Track"}
            </button>
          </form>
          {trackError && (
            <p style={{ color: '#fb7185', fontSize: '0.85rem', marginTop: '8px' }}>{trackError}</p>
          )}
        </div>
      </section>

      {/* Stats Bar */}
      <section style={{
        padding: '0 24px',
        marginTop: '-48px', position: 'relative', zIndex: 10,
      }}>
        <div className="glass-panel animate-fade-in-up delay-500" style={{
          maxWidth: '900px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1px',
          background: 'rgba(148, 163, 184, 0.1)',
          borderRadius: '16px', overflow: 'hidden',
        }}>
          {[
            { label: "Total Reports", value: stats.total, color: "#e2e8f0" },
            { label: "Pending", value: stats.pending, color: "#f43f5e" },
            { label: "Resolved", value: stats.resolved, color: "#10b981" },
            { label: "Avg. Resolution", value: stats.avgHours ? `${stats.avgHours}h` : "N/A", color: "#06b6d4" },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: '24px', textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.8)',
            }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: stat.color, lineHeight: 1.2 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginTop: '4px' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: '96px 24px 80px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '12px' }}>
            How <span className="gradient-text">JanPukar</span> Works
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
            From report to resolution in three steps, powered by AI.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '24px',
        }}>
          {STEPS.map((step, i) => (
            <div key={step.num} className="glass-panel card-hover animate-fade-in-up" style={{
              padding: '32px', animationDelay: `${i * 0.15}s`,
            }}>
              <div style={{
                fontSize: '2.5rem', marginBottom: '16px',
              }}>{step.icon}</div>
              <div style={{
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-emerald)',
                letterSpacing: '0.1em', marginBottom: '8px', fontFamily: 'var(--font-mono)',
              }}>STEP {step.num}</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>{step.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Channels Section */}
      <section style={{
        padding: '64px 24px 96px', maxWidth: '800px', margin: '0 auto', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '12px' }}>
          Report from <span className="gradient-text">Anywhere</span>
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>
          No app downloads. Use what you already have.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
        }}>
          <div className="glass-panel card-hover" style={{ padding: '28px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🌐</div>
            <h3 style={{ fontWeight: 700, marginBottom: '6px' }}>Web Portal</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Submit reports with photos and interactive map pinning. No login required.
            </p>
          </div>
          <div className="glass-panel card-hover" style={{ padding: '28px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✈️</div>
            <h3 style={{ fontWeight: 700, marginBottom: '6px' }}>Telegram Bot</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Send a message, attach a photo, share location. Get a tracking ID instantly.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
      }}>
        JanPukar — AI-Powered Civic Grievance Platform • Built for India&apos;s Cities
      </footer>
    </div>
  );
}
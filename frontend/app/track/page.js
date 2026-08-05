"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

const STATUS_STEPS = ["Submitted", "Pending", "In Progress", "Resolved"];

function TrackContent() {
  const searchParams = useSearchParams();
  const initId = searchParams.get("id") || "";

  const [id, setId] = useState(initId);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = async (lookupId) => {
    if (!lookupId) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const cleanId = lookupId.trim().replace(/^#/, "");
      const { data, error: sbError } = await supabase
        .from("grievances")
        .select("*")
        .or(`tracking_id.eq.${cleanId},id.eq.${cleanId}`)
        .limit(1)
        .single();

      if (sbError || !data) {
        throw new Error("No report found with that ID.");
      }

      setResult(data);
    } catch (err) {
      setError(err.message || "Could not find that report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initId) {
      fetchStatus(initId);
    }
  }, [initId]);

  useEffect(() => {
    let channel;
    if (result?.id) {
      channel = supabase
        .channel(`public:grievances:id=eq.${result.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "grievances", filter: `id=eq.${result.id}` },
          (payload) => {
            setResult(payload.new);
          }
        )
        .subscribe();
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [result?.id]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (id) fetchStatus(id);
  };

  const currentStatusIndex = result
    ? STATUS_STEPS.findIndex(s => s.toLowerCase() === (result.status || "pending").toLowerCase())
    : -1;

  // If "Pending", consider "Submitted" also completed. Map "Pending" to step 1.
  const activeStepIndex = currentStatusIndex >= 0 ? Math.max(1, currentStatusIndex) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '40px 16px 80px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }} className="animate-fade-in-up">
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800 }}>
            Track Your <span className="gradient-text">Report</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Enter your tracking ID to see real-time status updates and resolution progress.
          </p>
        </div>

        <form onSubmit={handleSearch} className="glass-panel animate-fade-in-up delay-100" style={{
          padding: '8px', display: 'flex', gap: '8px', marginBottom: '32px',
        }}>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. G-1024 or Report ID"
            className="input-dark"
            style={{ flex: 1, border: 'none', background: 'transparent' }}
          />
          <button type="submit" disabled={loading} className="btn-primary" style={{ padding: '12px 24px' }}>
            {loading ? "Searching..." : "Track"}
          </button>
        </form>

        {error && (
          <div className="animate-fade-in-up" style={{
            padding: '16px', borderRadius: '12px', background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {result && (
          <div className="glass-panel animate-fade-in-up md:p-8 p-5" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Glow accent matching status */}
            <div style={{
              position: 'absolute', top: 0, right: 0, width: '150px', height: '150px',
              background: result.status === 'Resolved' ? 'rgba(16, 185, 129, 0.1)' :
                result.status === 'In Progress' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(148, 163, 184, 0.05)',
              filter: 'blur(40px)', borderRadius: '50%', pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {result.category}
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '4px' }}>
                  {result.title || "Citizen Report"}
                </h2>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: '0.9rem', marginTop: '4px' }}>
                  {result.tracking_id || `#${result.id}`}
                </div>
              </div>

              <div className={`status-badge status-badge-${(result.status || "pending").toLowerCase().replace(" ", "-")}`}>
                {(result.status || "Pending")}
              </div>
            </div>

            <div style={{
              padding: '16px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.1)', marginBottom: '32px',
            }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                {result.description || "No description provided."}
              </p>
            </div>

            {/* Timeline */}
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Resolution Timeline</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {STATUS_STEPS.map((step, index) => {
                  const isCompleted = index <= activeStepIndex;
                  const isActive = index === activeStepIndex;

                  // Generate synthetic dates for timeline if actual timestamps aren't strictly logged per step
                  const createdNode = step === "Submitted" || step === "Pending" ? result.created_at : null;
                  const resolvedNode = step === "Resolved" && result.status === "Resolved" ? result.updated_at : null;

                  let dateStr = "";
                  if (createdNode) dateStr = new Date(createdNode).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                  else if (resolvedNode) dateStr = new Date(resolvedNode).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

                  return (
                    <div key={step} className="timeline-step" style={{ paddingBottom: index === STATUS_STEPS.length - 1 ? 0 : '32px' }}>
                      <div className={`timeline-dot ${isActive ? 'active' : ''} ${isCompleted && !isActive ? 'completed' : ''}`} />

                      <div style={{
                        opacity: isCompleted ? 1 : 0.4,
                      }}>
                        <div style={{ fontWeight: 600, color: isCompleted ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {step}
                        </div>
                        {isCompleted && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {dateStr || (isActive ? "Current phase" : "Completed")}
                          </div>
                        )}

                        {isActive && step === "In Progress" && (
                          <div style={{
                            marginTop: '8px', padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px',
                            fontSize: '0.85rem', color: '#fbbf24',
                          }}>
                            Municipal teams have been assigned and are currently addressing this issue.
                          </div>
                        )}

                        {isActive && step === "Pending" && (
                          <div style={{
                            marginTop: '8px', padding: '10px 14px', background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px',
                            fontSize: '0.85rem', color: '#34d399',
                          }}>
                            AI Triaged • Urgency Score: {result.urgency_score}/5
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(148, 163, 184, 0.1)',
              display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)'
            }}>
              <div>AI Deduplication: {result.report_count > 1 ? `${result.report_count} nearby reports merged` : 'Unique report'}</div>
              <div>Source: {result.user_id ? 'Web' : 'Telegram Bot'}</div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>Loading...</div>}>
      <TrackContent />
    </Suspense>
  );
}

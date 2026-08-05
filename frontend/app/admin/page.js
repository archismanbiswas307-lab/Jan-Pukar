"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../../lib/supabase";

const AdminMap = dynamic(() => import("../../components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p className="text-sm font-medium tracking-wide">
          Initializing Command Center...
        </p>
      </div>
    </div>
  ),
});

export default function AdminPage() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Fetch initial
    const fetchGrievances = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from("grievances")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        if (isMounted) {
          setGrievances(data || []);
          setError(null);
        }
      } catch (err) {
        console.error("Supabase fetch error:", err);
        if (isMounted) setError(err.message || "Failed to load data");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGrievances();

    // Subscribe to realtime
    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grievances" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setGrievances(prev => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setGrievances(prev => prev.map(g => g.id === payload.new.id ? payload.new : g));
          }
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const handleStatusChange = async (id, status) => {
    try {
      const { data, error } = await supabase
        .from("grievances")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select();

      if (error) throw error;
      if (data && data.length > 0) {
        setGrievances((prev) => prev.map((item) => (item.id === id ? data[0] : item)));
      }
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update: " + err.message);
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ["ID", "Tracking_ID", "Status", "Category", "Urgency", "Description", "Latitude", "Longitude", "Created"];
      const rows = grievances.map(g => [
        g.id, g.tracking_id || '', g.status || 'Pending', g.category || '', g.urgency_score || 1,
        `"${(g.description || '').replace(/"/g, '""')}"`, g.latitude || '', g.longitude || '', g.created_at || ''
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JanPukar_Export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error", e);
    }
  };

  const stats = useMemo(() => {
    const total = grievances.length;
    const pending = grievances.filter(g => (g.status || 'pending').toLowerCase() === 'pending').length;
    const critical = grievances.filter(g => (g.urgency_score || 1) >= 4 && (g.status || 'pending').toLowerCase() !== 'resolved').length;
    return { total, pending, critical };
  }, [grievances]);

  const visibleCategories = ["All", ...Array.from(new Set(grievances.map(g => g.category || "General"))).sort()];
  const STATUS_FILTERS = ["All", "Pending", "In Progress", "Resolved"];

  const filteredGrievances = useMemo(() => {
    return grievances.filter(g => {
      const catMatch = selectedCategory === "All" || g.category === selectedCategory;
      const statMatch = selectedStatus === "All" || (g.status || "Pending").toLowerCase() === selectedStatus.toLowerCase();
      return catMatch && statMatch;
    }).sort((a, b) => {
      // Sort by urgency desc, then date desc
      const uA = a.urgency_score || 1;
      const uB = b.urgency_score || 1;
      if (uA !== uB) return uB - uA;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [grievances, selectedCategory, selectedStatus]);

  const getStatusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "resolved") return "#10b981";
    if (s === "in progress" || s === "in_progress") return "#f59e0b";
    return "#f43f5e";
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>

      {/* Left Sidebar - Triage Queue */}
      <div style={{
        width: '450px', display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(148, 163, 184, 0.1)', background: 'var(--bg-secondary)',
        zIndex: 10,
      }}>
        {/* Header & Stats */}
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Triage Queue</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: realtimeConnected ? '#10b981' : '#f59e0b',
                boxShadow: realtimeConnected ? '0 0 8px #10b981' : 'none',
              }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {realtimeConnected ? 'LIVE' : 'SYNCING'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(15,23,42,0.5)', padding: '12px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{stats.total}</div>
            </div>
            <div style={{ background: 'rgba(244,63,94,0.1)', padding: '12px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.7rem', color: '#fb7185', textTransform: 'uppercase', fontWeight: 600 }}>Pending</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fb7185' }}>{stats.pending}</div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.1)', padding: '12px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.7rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 600 }}>Critical</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{stats.critical}</div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="input-dark" style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              >
                {STATUS_FILTERS.map(f => (
                  <option key={f} value={f}>{f} Status</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {visibleCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 600,
                    whiteSpace: 'nowrap', border: '1px solid',
                    background: selectedCategory === cat ? 'rgba(16,185,129,0.1)' : 'transparent',
                    color: selectedCategory === cat ? '#10b981' : 'var(--text-muted)',
                    borderColor: selectedCategory === cat ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.2)',
                    cursor: 'pointer'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>}

          {!loading && filteredGrievances.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No reports match current filters.
            </div>
          )}

          {filteredGrievances.map(g => (
            <div
              key={g.id}
              onClick={() => setSelectedId(g.id)}
              className="card-hover"
              style={{
                background: selectedId === g.id ? 'rgba(30,41,59,0.8)' : 'rgba(15,23,42,0.6)',
                border: '1px solid',
                borderColor: selectedId === g.id ? 'var(--accent-emerald)' : 'rgba(148,163,184,0.1)',
                borderRadius: '12px', padding: '16px', cursor: 'pointer',
                position: 'relative', overflow: 'hidden'
              }}
            >
              {/* Urgency Line indicator */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: getStatusColor(g.status) }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {g.tracking_id || `#${g.id}`} • {new Date(g.created_at).toLocaleDateString()}
                </span>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                  background: (g.urgency_score || 1) >= 4 ? 'rgba(244,63,94,0.1)' : 'transparent',
                  color: (g.urgency_score || 1) >= 4 ? '#fb7185' : 'var(--text-secondary)'
                }}>
                  U-{g.urgency_score || 1}
                </span>
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px', width: '90%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.title || "Report"}
              </h3>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
                  {g.category}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: getStatusColor(g.status) }}>
                  {g.status || "Pending"}
                </span>
              </div>

              {g.report_count > 1 && (
                <div style={{ marginTop: '12px', fontSize: '0.7rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ⚠️ Duplicates Merged ({g.report_count})
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <button
            onClick={handleExportCSV}
            className="btn-secondary"
            style={{ width: '100%', fontSize: '0.8rem', padding: '10px' }}
          >
            Download CSV Export
          </button>
        </div>
      </div>

      {/* Right Map View */}
      <div style={{ flex: 1, position: 'relative' }}>
        <AdminMap grievances={filteredGrievances} onStatusChange={handleStatusChange} selectedId={selectedId} />
      </div>

    </div>
  );
}
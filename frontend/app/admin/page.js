"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../../lib/supabase";

// Go up two levels (../../) to reach root 'components'
const AdminMap = dynamic(() => import("../../components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p className="text-sm font-medium tracking-wide">
          Initializing JanPukar Control Room Map...
        </p>
      </div>
    </div>
  ),
});

export default function AdminPage() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedUrgency, setSelectedUrgency] = useState("All");
  const [realtimeFallback, setRealtimeFallback] = useState(false);

  const stats = useMemo(() => {
    const total = grievances.length;
    const highUrgency = grievances.filter(
      (g) => (g.urgency_score || 1) >= 4
    ).length;

    const categories = grievances.reduce((acc, curr) => {
      const cat = curr.category || "Unassigned";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    return { total, highUrgency, categories };
  }, [grievances]);

  const avgResolutionHours = useMemo(() => {
    const resolved = grievances.filter((g) => g.status === "Resolved" && g.created_at && g.updated_at);
    if (!resolved.length) return null;
    const diffs = resolved.map((r) => (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60));
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    return avg;
  }, [grievances]);

  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase.from("grievances").select("*");
      if (error) throw error;
      const rows = data || [];
      const headers = ["id","tracking_id","title","category","urgency_score","status","latitude","longitude","created_at","updated_at","image_url"];
      const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => (""+ (r[h] ?? "")).replace(/"/g,'""')).map(v => `"${v}"`).join(","))).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `janpukar_grievances_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
      setError("Failed to export CSV.");
    }
  };

  const visibleCategories = useMemo(() => {
    const categories = Object.keys(stats.categories || {}).sort((a, b) =>
      a.localeCompare(b)
    );
    return ["All", ...categories];
  }, [stats.categories]);

  const visibleGrievances = useMemo(() => {
    return grievances.filter((item) => {
      const urgency = Number(item.urgency_score || 1);
      const matchesCategory =
        selectedCategory === "All" ||
        (item.category || "General") === selectedCategory;
      const matchesUrgency =
        selectedUrgency === "All" ||
        (selectedUrgency === ">=4" && urgency >= 4) ||
        (selectedUrgency === ">=2" && urgency >= 2);

      return matchesCategory && matchesUrgency;
    });
  }, [grievances, selectedCategory, selectedUrgency]);

  useEffect(() => {
    let isMounted = true;
    let intervalId;

    const fetchGrievances = async (showLoading = false) => {
      try {
        if (showLoading) setLoading(true);
        const { data, error: fetchError } = await supabase
          .from("grievances")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;

        if (isMounted) {
          setGrievances(data || []);
          setError(null);
          setRealtimeFallback(false);
        }
      } catch (err) {
        const message = err?.message || "Unable to sync reports.";
        console.error("Supabase fetch error:", message);
        if (isMounted) {
          setError(message);
          setRealtimeFallback(true);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGrievances(true);

    intervalId = window.setInterval(() => {
      fetchGrievances(false);
    }, 20000);

    const channel = supabase
      .channel("realtime-grievances-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grievances" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setGrievances((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setGrievances((prev) =>
              prev.map((item) => (item.id === payload.new.id ? payload.new : item))
            );
          } else if (payload.eventType === "DELETE") {
            setGrievances((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          setRealtimeFallback(false);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err) {
          setRealtimeFallback(true);
        }
      });

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleStatusChange = async (id, status) => {
    try {
      const { data, error } = await supabase
        .from("grievances")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setGrievances((prev) => prev.map((item) => (item.id === id ? data : item)));
      setError(null);
    } catch (err) {
      const message = err?.message || "Unable to update status.";
      console.error("Failed to update status:", message);
      setError(message);
    }
  };

  return (
    <main className="relative h-screen w-full overflow-hidden bg-gray-900">
      <div className="absolute top-4 left-14 right-4 z-[1000] flex flex-wrap items-center justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900/70 backdrop-blur-md px-4 py-3 rounded-xl shadow-xl border border-slate-700/50 text-white/90">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h1 className="text-base font-bold tracking-tight">
              JanPukar Control Room
            </h1>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            AI-Deduplicated Live Municipal Heatmap
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {visibleCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  selectedCategory === category
                    ? "border-emerald-400 bg-emerald-500/16 text-emerald-300/90"
                    : "border-slate-700 bg-slate-800/60 text-slate-300/85"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            { [
              { label: "All", value: "All" },
              { label: "High (>=4)", value: ">=4" },
              { label: "Medium (>=2)", value: ">=2" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedUrgency(option.value)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  selectedUrgency === option.value
                    ? "border-rose-400 bg-rose-500/20 text-rose-300"
                    : "border-slate-700 bg-slate-800/80 text-slate-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/70 backdrop-blur-md p-2 rounded-xl border border-slate-700/50 shadow-xl text-white/90 text-xs">
          <div className="px-3 py-1.5 bg-slate-800/80 rounded-lg">
            <span className="text-slate-400 text-[10px] block uppercase font-semibold">
              Total Reports
            </span>
            <span className="text-sm font-bold">{stats.total}</span>
          </div>

          <div className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400/90">
            <span className="text-rose-400/70 text-[10px] block uppercase font-semibold">
              High Urgency
            </span>
            <span className="text-sm font-bold">{stats.highUrgency}</span>
          </div>

          <div className="px-2 py-1.5 text-[11px] rounded-lg bg-slate-800/80 text-slate-300/85">
            {realtimeFallback ? "Fallback sync" : "Live sync"}
          </div>

          <button onClick={handleExportCSV} className="px-3 py-1 rounded bg-slate-700/60 text-[11px] hover:bg-slate-700">Export CSV</button>

          {avgResolutionHours !== null && (
            <div className="px-3 py-1.5 bg-slate-800 rounded-lg text-[11px]">
              <span className="text-slate-400 text-[10px] block uppercase">Avg Resolution</span>
              <span className="text-sm font-bold">{avgResolutionHours.toFixed(1)} hrs</span>
            </div>
          )}

          {loading && (
            <div className="px-2 text-slate-400 text-[11px] animate-pulse">
              Syncing...
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-rose-600 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
          Failed to fetch reports: {error}
        </div>
      )}

      {visibleGrievances.length === 0 && !loading && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] bg-slate-800/90 text-slate-200 text-xs px-4 py-2 rounded-lg border border-slate-700 shadow-lg">
          No reports match the current filters.
        </div>
      )}

      <AdminMap grievances={visibleGrievances} onStatusChange={handleStatusChange} />
    </main>
  );
}
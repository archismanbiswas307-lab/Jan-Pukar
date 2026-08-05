"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function TrackPage() {
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase
        .from("grievances")
        .select("id,tracking_id,status,category,title,created_at,updated_at,urgency_score")
        .or(`tracking_id.eq.${id},id.eq.${id}`)
        .limit(1)
        .single();

      if (error) throw error;
      setResult(data || null);
    } catch (err) {
      console.error(err);
      setResult({ error: "Not found" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-3">Check Report Status</h2>
      <form onSubmit={lookup} className="flex gap-2">
        <input value={id} onChange={(e)=>setId(e.target.value)} placeholder="Enter Tracking ID or Report ID" className="flex-1 p-2 border rounded" />
        <button disabled={loading || !id} className="px-4 py-2 bg-slate-700 text-white rounded">{loading?"Looking...":"Lookup"}</button>
      </form>

      {result && (
        <div className="mt-4 p-4 bg-white rounded shadow">
          {result.error ? (
            <div className="text-rose-600">{result.error}</div>
          ) : (
            <div>
              <div className="text-sm text-slate-500">Tracking</div>
              <div className="font-bold text-lg">{result.tracking_id || `#${result.id}`}</div>
              <div className="mt-2">Status: <span className="font-semibold">{result.status}</span></div>
              <div className="mt-1 text-sm text-slate-600">Category: {result.category}</div>
              <div className="mt-1 text-sm text-slate-600">Urgency: {result.urgency_score}/5</div>
              <div className="mt-2 text-xs text-slate-400">Reported: {result.created_at ? new Date(result.created_at).toLocaleString() : 'N/A'}</div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

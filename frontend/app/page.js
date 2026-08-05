"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase"; 

// Dynamically load Map with correct relative path from app/page.js
const Map = dynamic(() => import("../components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p className="text-sm font-medium tracking-wide">
          Loading Control Room Map...
        </p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchGrievances() {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from("grievances")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;

        if (isMounted) {
          console.log("Supabase Data Returned:", data);
          setGrievances(data || []);
          setError(null);
        }
      } catch (err) {
        console.error("Supabase Error:", err.message || err);
        if (isMounted) setError(err.message || "Failed to fetch grievances");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchGrievances();

    const channel = supabase
      .channel("admin-grievances-changes")
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
            setGrievances((prev) =>
              prev.filter((item) => item.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="h-screen w-full relative bg-gray-900">
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-rose-600 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
          Error: {error}
        </div>
      )}

      <Map grievances={grievances} />
    </main>
  );
}
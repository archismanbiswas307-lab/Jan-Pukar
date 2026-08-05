"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { compressImageFile } from "../../components/UploadUtils";

export default function SubmitPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [urgency, setUrgency] = useState(2);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [latField, setLatField] = useState("");
  const [lngField, setLngField] = useState("");
  const [geoStatus, setGeoStatus] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const clearFileInput = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (mounted) setSession(currentSession);
      } catch (err) {
        console.error("Auth session load failed:", err);
      } finally {
        if (mounted) setAuthLoading(false);
      }
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMessage({ type: "success", text: "Signed out successfully." });
  };

  const useBrowserLocation = async () => {
    setGeoStatus("Locating...");
    try {
      if (!navigator.geolocation) throw new Error("Geolocation not available");
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      const la = pos.coords.latitude;
      const ln = pos.coords.longitude;
      setLatField(String(la));
      setLngField(String(ln));
      setGeoStatus("Location captured");
    } catch (err) {
      console.warn("Geolocation error:", err);
      setGeoStatus("Unable to get location — enter manually or try again");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!session) {
      setMessage({ type: "error", text: "Please log in before submitting a complaint." });
      return;
    }

    setSubmitting(true);
    try {
      let lat = null;
      let lng = null;
      let image_url = null;

      if (file) {
        try {
          const compressed = await compressImageFile(file, 1600, 1200, 0.75);
          const uploadFile = compressed || file;
          const filename = `grievance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("grievance-images")
            .upload(filename, uploadFile, { cacheControl: "3600", upsert: false });

          if (uploadError) {
            console.error("Upload error:", uploadError);
            throw new Error(uploadError.message || "Image upload failed.");
          }

          const { data: publicData, error: publicError } = await supabase.storage
            .from("grievance-images")
            .getPublicUrl(filename);

          if (publicError || !publicData?.publicUrl) {
            console.error("Public URL error:", publicError);
            throw new Error("Image uploaded but public URL could not be generated.");
          }

          image_url = publicData.publicUrl;
        } catch (upErr) {
          console.error("Upload exception:", upErr);
          setMessage({ type: "error", text: `Image upload failed: ${upErr?.message || upErr}` });
        }
      }

      const finalLat = latField ? parseFloat(latField) : (lat ?? null);
      const finalLng = lngField ? parseFloat(lngField) : (lng ?? null);
      const userId = session?.user?.email
        ? `web_${session.user.email}`
        : `web_${session.user?.id}`;

      const payload = {
        user_id: userId,
        title: title || "Citizen Report",
        description: description || "",
        category,
        latitude: Number.isFinite(finalLat) ? finalLat : null,
        longitude: Number.isFinite(finalLng) ? finalLng : null,
        status: "Pending",
        urgency_score: Number(urgency) || 1,
        image_url,
        report_count: 1,
      };

      // Insert and select to get consistent error shape across SDK versions (use array form)
      const { data: insertedData, error: insertError } = await supabase.from("grievances").insert([payload]).select();
      if (insertError) throw insertError;

      const insertedId = Array.isArray(insertedData) && insertedData.length > 0 ? insertedData[0].id : null;
      setMessage({ type: "success", text: `Submitted — ID: ${insertedId || "unknown"}` });
      setTitle("");
      setDescription("");
      clearFileInput();
      setLatField("");
      setLngField("");
      setGeoStatus("");
    } catch (err) {
      // Build a safe, readable error message and log full debug info.
      const safeStringify = (v) => {
        try {
          if (v === null || v === undefined) return String(v);
          if (typeof v === "string") return v;
          // include non-enumerable props too
          return JSON.stringify(v, Object.getOwnPropertyNames(v));
        } catch (e) {
          try { return String(v); } catch (e2) { return "<unserializable error>"; }
        }
      };

      let human = "Failed to submit. Try again.";
      try {
        if (!err) human = "Unknown error";
        else if (typeof err === "string") human = err;
        else if (err.message) human = err.message;
        else if (err.error && typeof err.error === "string") human = err.error;
        else human = safeStringify(err);
      } catch (ex) {
        human = "Failed to submit (unknown error)";
      }

      // Log full error object for diagnostics (don’t rely on console output shape in the UI)
      try { console.error("submit error:", err); } catch (e) { /* ignore logging failures */ }

      setMessage({ type: "error", text: human });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="p-6 max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold">Report an Issue</h2>
          <p className="text-sm text-slate-400">Login ensures the portal is no longer anonymous and makes your report traceable.</p>
        </div>
        {authLoading ? (
          <div className="text-sm text-slate-400">Checking login...</div>
        ) : session ? (
          <div className="text-sm text-slate-200">
            Signed in as <span className="font-semibold">{session.user.email || session.user.id}</span>
            <button type="button" onClick={handleSignOut} className="ml-3 text-emerald-300 hover:text-emerald-100">Sign out</button>
          </div>
        ) : (
          <div className="text-sm text-slate-200">
            <a href="/login" className="text-emerald-300 hover:text-emerald-100">Sign in / create account</a> to submit.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 bg-slate-800/95 p-4 rounded shadow-lg text-white" aria-labelledby="report-title">
        <div>
          <label htmlFor="report-title" className="sr-only">Report title</label>
          <input id="report-title" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Short title" className="w-full p-2 border border-slate-700 rounded bg-slate-900/60 text-white placeholder-slate-400" />
        </div>
        <div>
          <label htmlFor="report-description" className="sr-only">Description</label>
          <textarea id="report-description" value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Describe the issue" className="w-full p-2 border border-slate-700 rounded h-28 bg-slate-900/60 text-white placeholder-slate-400" />
        </div>

        <div className="flex gap-2">
          <select value={category} onChange={(e)=>setCategory(e.target.value)} className="p-2 border border-slate-700 rounded w-1/2 bg-slate-900/60 text-white">
            <option>General</option>
            <option>Roads & Traffic</option>
            <option>Sanitation</option>
            <option>Water & Sewage</option>
            <option>Electricity</option>
            <option>Public Safety</option>
          </select>
          <select value={urgency} onChange={(e)=>setUrgency(e.target.value)} className="p-2 border border-slate-700 rounded w-1/2 bg-slate-900/60 text-white">
            <option value={1}>Low (1)</option>
            <option value={2}>Medium (2)</option>
            <option value={3}>Medium-High (3)</option>
            <option value={4}>High (4)</option>
            <option value={5}>Critical (5)</option>
          </select>
        </div>

        <div>
          <label htmlFor="report-photo" className="block text-sm font-medium">Photo (optional)</label>
          <input id="report-photo" ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="mt-1 text-sm text-slate-200" aria-describedby="photo-help" />
          <div id="photo-help" className="sr-only">Attach a photo to help illustrate the issue. Optional.</div>
          {file && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-slate-300">{file.name}</span>
              <button type="button" onClick={clearFileInput} className="text-xs text-rose-400">Remove</button>
            </div>
          )}
        </div>

        <fieldset className="grid grid-cols-3 gap-2" aria-describedby="location-help">
          <div>
            <label htmlFor="latitude" className="sr-only">Latitude</label>
            <input id="latitude" value={latField} onChange={(e)=>setLatField(e.target.value)} placeholder="Latitude" className="p-2 border border-slate-700 rounded bg-slate-900/60 text-white" />
          </div>
          <div>
            <label htmlFor="longitude" className="sr-only">Longitude</label>
            <input id="longitude" value={lngField} onChange={(e)=>setLngField(e.target.value)} placeholder="Longitude" className="p-2 border border-slate-700 rounded bg-slate-900/60 text-white" />
          </div>
          <div>
            <button type="button" onClick={useBrowserLocation} className="p-2 rounded bg-slate-700/70 text-white">Use browser location</button>
          </div>
        </fieldset>
        <div id="location-help" className="sr-only">Use browser geolocation or enter latitude and longitude manually.</div>
        {geoStatus && <div className="text-sm text-slate-300">{geoStatus}</div>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button disabled={submitting || !session || authLoading} type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? "Submitting..." : "Submit Report"}
          </button>
          <div className="text-sm text-slate-300/90">
            {session ? "Location: will attempt browser geolocation or use manual fields above" : "Login first to enable report submission."}
          </div>
        </div>

        {message && (
          <div className={`p-2 rounded ${message.type === 'success' ? 'bg-emerald-50/90 text-emerald-700/90' : 'bg-rose-50/90 text-rose-700/90'}`}>
            {message.text}
          </div>
        )}
      </form>
    </main>
  );
}

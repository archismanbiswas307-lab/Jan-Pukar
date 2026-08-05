"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { compressImageFile } from "../../components/UploadUtils";
import dynamic from "next/dynamic";

const LocationPicker = dynamic(() => import("../../components/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div style={{
      height: '250px', borderRadius: '12px',
      background: 'rgba(15, 23, 42, 0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: '0.85rem',
    }}>Loading map...</div>
  ),
});

const CATEGORIES = [
  { value: "General", icon: "📋", label: "General" },
  { value: "Roads & Traffic", icon: "🛣️", label: "Roads" },
  { value: "Sanitation", icon: "🗑️", label: "Sanitation" },
  { value: "Water & Sewage", icon: "💧", label: "Water" },
  { value: "Electricity", icon: "⚡", label: "Electricity" },
  { value: "Public Safety", icon: "🛡️", label: "Safety" },
];

export default function SubmitPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [geoStatus, setGeoStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }, []);

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  }, [handleFile]);

  const useBrowserLocation = async () => {
    setGeoStatus("Locating...");
    try {
      if (!navigator.geolocation) throw new Error("Geolocation not available");
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      setGeoStatus("Location captured ✓");
    } catch (err) {
      console.warn("Geolocation error:", err);
      setGeoStatus("Unable to get location — click on the map instead");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      let image_url = null;

      if (file) {
        try {
          const compressed = await compressImageFile(file, 1600, 1200, 0.75);
          const uploadFile = compressed || file;
          const filename = `grievance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

          const { error: uploadError } = await supabase.storage
            .from("grievance-images")
            .upload(filename, uploadFile, { cacheControl: "3600", upsert: false });

          if (uploadError) throw new Error(uploadError.message);

          const { data: publicData } = await supabase.storage
            .from("grievance-images")
            .getPublicUrl(filename);

          image_url = publicData?.publicUrl || null;
        } catch (upErr) {
          console.error("Upload exception:", upErr);
        }
      }

      const payload = {
        user_id: "public_submitter",
        title: title || "Citizen Report",
        description: description || "",
        category,
        latitude: lat,
        longitude: lng,
        status: "Pending",
        urgency_score: 1,
        image_url,
        report_count: 1,
      };

      const { data: insertedData, error: insertError } = await supabase
        .from("grievances")
        .insert([payload])
        .select();
      if (insertError) throw insertError;

      const inserted = insertedData?.[0] || {};
      const displayId = inserted.tracking_id || `#${inserted.id || "unknown"}`;
      setMessage({
        type: "success",
        text: `Report submitted successfully!`,
        trackingId: displayId,
      });
      setTitle("");
      setDescription("");
      setCategory("General");
      clearFile();
      setLat(null);
      setLng(null);
      setGeoStatus("");
    } catch (err) {
      let human = "Failed to submit. Try again.";
      if (err?.message) human = err.message;
      setMessage({ type: "error", text: human });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '32px 16px 64px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {/* Header */}
        <div className="animate-fade-in-up" style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>
            Report an <span className="gradient-text">Issue</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Submit your problem quickly — no login required. AI will categorize and prioritize it automatically.
          </p>
        </div>

        {/* Success Modal */}
        {message?.type === "success" && (
          <div className="glass-panel animate-fade-in-up" style={{
            padding: '24px', marginBottom: '24px', textAlign: 'center',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✅</div>
            <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '8px' }}>{message.text}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Your tracking ID:
            </p>
            <div style={{
              display: 'inline-block', padding: '8px 24px',
              background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem',
              color: '#34d399',
            }}>
              {message.trackingId}
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(message.trackingId);
              }}
              style={{
                display: 'block', margin: '12px auto 0', fontSize: '0.8rem',
                color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              📋 Copy to clipboard
            </button>
          </div>
        )}

        {message?.type === "error" && (
          <div style={{
            padding: '14px 20px', borderRadius: '10px', marginBottom: '20px',
            background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185', fontSize: '0.9rem',
          }}>
            {message.text}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-panel animate-fade-in-up delay-100" style={{ padding: '28px' }}>
          {/* Title */}
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="report-title" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Issue Title
            </label>
            <input
              id="report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pothole on Main Street"
              className="input-dark"
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="report-desc" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Description
            </label>
            <textarea
              id="report-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail..."
              className="input-dark"
              style={{ minHeight: '100px', resize: 'vertical' }}
            />
          </div>

          {/* Category Grid */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Category
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  style={{
                    padding: '12px 8px', borderRadius: '10px', border: 'none',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease',
                    background: category === cat.value ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                    color: category === cat.value ? '#34d399' : 'var(--text-secondary)',
                    outline: category === cat.value ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(148, 163, 184, 0.15)',
                  }}
                >
                  <div style={{ fontSize: '1.3rem', marginBottom: '4px' }}>{cat.icon}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{cat.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Photo Upload */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Photo Evidence (optional)
            </label>

            {!preview ? (
              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.6 }}>📸</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Drop a photo here or <span style={{ color: '#10b981', fontWeight: 600 }}>click to browse</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>
                  JPG, PNG, WEBP supported
                </div>
              </div>
            ) : (
              <div style={{
                position: 'relative', borderRadius: '12px', overflow: 'hidden',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}>
                <img src={preview} alt="Preview" style={{
                  width: '100%', height: '180px', objectFit: 'cover', display: 'block',
                }} />
                <button
                  type="button"
                  onClick={clearFile}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: 'rgba(0,0,0,0.7)', color: 'white',
                    border: 'none', borderRadius: '8px', padding: '4px 12px',
                    fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >✕ Remove</button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
          </div>

          {/* Location Picker */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Location
            </label>

            <div style={{ marginBottom: '10px' }}>
              <LocationPicker
                lat={lat}
                lng={lng}
                onLocationChange={(newLat, newLng) => {
                  setLat(newLat);
                  setLng(newLng);
                  setGeoStatus("Location set from map ✓");
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={useBrowserLocation}
                className="btn-secondary"
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                📍 Use My Location
              </button>
              {geoStatus && (
                <span style={{ fontSize: '0.8rem', color: geoStatus.includes("✓") ? '#34d399' : 'var(--text-muted)' }}>
                  {geoStatus}
                </span>
              )}
            </div>

            {lat && lng && (
              <div style={{
                marginTop: '8px', fontSize: '0.75rem',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              }}>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
            style={{
              width: '100%', fontSize: '1rem', padding: '14px',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Submitting..." : "📢 Submit Report"}
          </button>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '12px' }}>
            No account needed. Reports are processed by AI instantly.
          </p>
        </form>
      </div>
    </div>
  );
}

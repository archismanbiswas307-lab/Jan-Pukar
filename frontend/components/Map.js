"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper component to auto-fit map bounds when grievances load or change count
function ChangeView({ markers }) {
  const map = useMap();

  useEffect(() => {
    if (!markers || markers.length === 0) return;

    const validCoords = markers
      .map((item) => {
        const lat = parseFloat(item.latitude ?? item.lat);
        const lng = parseFloat(item.longitude ?? item.lng);
        return !isNaN(lat) && !isNaN(lng) ? [lat, lng] : null;
      })
      .filter(Boolean);

    if (validCoords.length > 0) {
      if (validCoords.length === 1) {
        map.setView(validCoords[0], 15);
      } else {
        map.fitBounds(validCoords, { padding: [50, 50], maxZoom: 16 });
      }
    }
  }, [markers?.length, map]);

  return null;
}

// Get marker color based on urgency score
const getUrgencyColor = (urgency) => {
  if (urgency >= 4) return "#ef4444"; // Red (High)
  if (urgency >= 2) return "#f59e0b"; // Amber (Medium)
  return "#10b981"; // Emerald (Low)
};

// Get status badge color
const getStatusColor = (status) => {
  switch (status) {
    case "Resolved":
      return "#10b981";
    case "In Progress":
      return "#f59e0b";
    case "Pending":
    default:
      return "#3b82f6";
  }
};

export default function Map({ grievances = [], onStatusChange }) {
  const [pendingActionId, setPendingActionId] = useState(null);
  const [ClusterGroup, setClusterGroup] = useState(null);
  const defaultCenter = [22.5726, 88.3639];

  const handleStatusClick = async (item, status) => {
    if (!onStatusChange || !item?.id) return;
    setPendingActionId(`${item.id}-${status}`);
    try {
      await onStatusChange(item.id, status);
    } finally {
      setPendingActionId(null);
    }
  };

  // Try to dynamically load marker cluster library; fallback gracefully when absent.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import("react-leaflet-markercluster");
        const Cluster = mod.default || mod.MarkerClusterGroup || null;
        if (mounted && Cluster) setClusterGroup(() => Cluster);
      } catch (err) {
        // no-op: dependency may not be installed in this environment
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const renderMarkers = () => {
    if (ClusterGroup) {
      const CG = ClusterGroup;
      return (
        <CG>
          {grievances.map((item, index) => {
            const lat = parseFloat(item.latitude ?? item.lat);
            const lng = parseFloat(item.longitude ?? item.lng);
            if (isNaN(lat) || isNaN(lng)) return null;

            const urgency = Number(item.urgency_score || 1);
            const color = getUrgencyColor(urgency);
            const category = item.category || "General";
            const title = item.title || "Grievance Report";
            const isTelegram = String(item.user_id || "").length > 0;
            const currentStatus = item.status || "Pending";
            const isPending = pendingActionId === `${item.id}-In Progress` || pendingActionId === `${item.id}-Resolved`;

            const icon = L.divIcon({
              className: "custom-div-icon",
              html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;"></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            });

            return (
              <Marker key={item.id || `m-${index}`} position={[lat, lng]} icon={icon}>
                <Popup className="custom-popup">
                  <div className="p-1 min-w-[200px] max-w-[240px] text-slate-800/85">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{category}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: color }}>Urgency: {urgency}/5</span>
                    </div>
                    <h4 className="font-bold text-sm leading-tight text-slate-900 mb-1">{title}</h4>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-2">{item.description || "No description provided."}</p>
                    <div className="my-2 rounded-md overflow-hidden border border-slate-200 bg-slate-100/80 p-0.5">
                      {item.image_url ? (
                        <a href={item.image_url} target="_blank" rel="noopener noreferrer"><img src={item.image_url} alt="Grievance Proof" style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }} /></a>
                      ) : (
                        <div className="text-[10px] text-center text-slate-400 py-3 italic">No photo attached</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Status:</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white/95" style={{ backgroundColor: getStatusColor(currentStatus) }}>{currentStatus}</span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Source: {isTelegram ? "Telegram Bot" : "Web Portal"}</span>
                      {item.created_at && (<span>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>)}
                    </div>
                    {onStatusChange && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" disabled={isPending} onClick={() => handleStatusClick(item, "In Progress")} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">{isPending && pendingActionId === `${item.id}-In Progress` ? "Updating..." : "In Progress"}</button>
                        <button type="button" disabled={isPending} onClick={() => handleStatusClick(item, "Resolved")} className="rounded-md border border-emerald-500 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">{isPending && pendingActionId === `${item.id}-Resolved` ? "Updating..." : "Resolve"}</button>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </CG>
      );
    }

    // default (no cluster)
    return grievances.map((item, index) => {
      const lat = parseFloat(item.latitude ?? item.lat);
      const lng = parseFloat(item.longitude ?? item.lng);

      if (isNaN(lat) || isNaN(lng)) return null;

      const urgency = Number(item.urgency_score || 1);
      const color = getUrgencyColor(urgency);
      const category = item.category || "General";
      const title = item.title || "Grievance Report";
      const isTelegram = String(item.user_id || "").length > 0;
      const currentStatus = item.status || "Pending";
      const isPending = pendingActionId === `${item.id}-In Progress` || pendingActionId === `${item.id}-Resolved`;

      return (
        <CircleMarker
          key={item.id || `marker-${lat}-${lng}-${index}`}
          center={[lat, lng]}
          radius={Math.max(10, urgency * 4)}
          pathOptions={{
            color: "#ffffff",
            fillColor: color,
            fillOpacity: 0.85,
            weight: 2,
          }}
        >
          <Popup className="custom-popup">
                  <div className="p-1 min-w-[200px] max-w-[240px] text-slate-800/85">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{category}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: color }}>Urgency: {urgency}/5</span>
              </div>

              <h4 className="font-bold text-sm leading-tight text-slate-900 mb-1">{title}</h4>
              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-2">{item.description || "No description provided."}</p>

                    <div className="my-2 rounded-md overflow-hidden border border-slate-200 bg-slate-100/80 p-0.5">
                {item.image_url ? (
                  <a href={item.image_url} target="_blank" rel="noopener noreferrer"><img src={item.image_url} alt="Grievance Proof" style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }} onError={(e) => { console.error("Failed to load image from URL:", item.image_url); }} /></a>
                ) : (
                  <div className="text-[10px] text-center text-slate-400 py-3 italic">No photo attached</div>
                )}
              </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Status:</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white/95" style={{ backgroundColor: getStatusColor(currentStatus) }}>{currentStatus}</span>
              </div>

              <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>Source: {isTelegram ? "Telegram Bot" : "Web Portal"}</span>
                {item.created_at && (<span>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>)}
              </div>

              {onStatusChange && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={isPending} onClick={() => handleStatusClick(item, "In Progress")} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">{isPending && pendingActionId === `${item.id}-In Progress` ? "Updating..." : "In Progress"}</button>
                  <button type="button" disabled={isPending} onClick={() => handleStatusClick(item, "Resolved")} className="rounded-md border border-emerald-500 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">{isPending && pendingActionId === `${item.id}-Resolved` ? "Updating..." : "Resolve"}</button>
                </div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      );
    });
  };

  return (
    <div className="w-full h-full min-h-[500px] relative z-0">
      <MapContainer
        key={typeof window !== "undefined" ? "leaflet-map-mounted" : "leaflet-map-init"}
        center={defaultCenter}
        zoom={14}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        className="rounded-lg shadow-inner"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ChangeView markers={grievances} />

        {grievances && renderMarkers()}
      </MapContainer>
    </div>
  );
}
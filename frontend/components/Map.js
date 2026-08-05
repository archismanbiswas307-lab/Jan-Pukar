"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix standard Leaflet icon paths in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function getNormalizedRadius(urgency, zoom) {
  const baseRadius = Math.max(8, urgency * 3);
  const zoomFactor = zoom / 14;
  return Math.max(6, baseRadius * zoomFactor);
}

function ChangeView({ markers, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!markers || markers.length === 0) return;

    if (selectedId) {
      const selected = markers.find(m => m.id === selectedId);
      if (selected) {
        const lat = parseFloat(selected.latitude ?? selected.lat);
        const lng = parseFloat(selected.longitude ?? selected.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          map.flyTo([lat, lng], 16, { duration: 1.5 });
          return;
        }
      }
    }

    // Otherwise fit all
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
  }, [markers, map, selectedId]);

  return null;
}

const getStatusColor = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "resolved") return "#10b981"; // Emerald
  if (s === "in progress" || s === "in_progress") return "#f59e0b"; // Amber
  return "#f43f5e"; // Rose for Pending
};

const getStatusLabel = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "resolved") return "Resolved";
  if (s === "in progress" || s === "in_progress") return "In Progress";
  return "Pending";
};

export default function Map({ grievances = [], onStatusChange, selectedId = null }) {
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import("react-leaflet-markercluster");
        const Cluster = mod.default || mod.MarkerClusterGroup || null;
        if (mounted && Cluster) setClusterGroup(() => Cluster);
      } catch (err) { }
    })();
    return () => { mounted = false; };
  }, []);

  const renderPopupContent = (item) => {
    const urgency = Number(item.urgency_score || 1);
    const category = item.category || "General";
    const title = item.title || "Grievance Report";
    const statusColor = getStatusColor(item.status);
    const statusLabel = getStatusLabel(item.status);
    const isPending = pendingActionId === `${item.id}-In Progress` || pendingActionId === `${item.id}-Resolved`;

    return (
      <div style={{ color: 'var(--text-primary)', padding: '2px', minWidth: '220px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {category}
          </span>
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
            background: 'rgba(244, 63, 94, 0.1)', color: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.2)',
          }}>
            URGENCY {urgency}/5
          </span>
        </div>

        <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{title}</h4>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.description || "No description"}
        </div>

        {item.image_url && (
          <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.1)' }}>
            <img src={item.image_url} alt="Proof" style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '8px', borderRadius: '8px', background: 'rgba(15,23,42,0.6)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
        </div>

        {onStatusChange && statusLabel !== 'Resolved' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {statusLabel === 'Pending' && (
              <button
                disabled={isPending}
                onClick={(e) => { e.stopPropagation(); handleStatusClick(item, "In Progress"); }}
                style={{
                  padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                  background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)',
                  cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1
                }}
              >
                In Progress
              </button>
            )}
            <button
              disabled={isPending}
              onClick={(e) => { e.stopPropagation(); handleStatusClick(item, "Resolved"); }}
              style={{
                gridColumn: statusLabel === 'In Progress' ? 'span 2' : 'span 1',
                padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)',
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1
              }}
            >
              Resolve
            </button>
          </div>
        )}
      </div>
    );
  };

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
            const color = getStatusColor(item.status);
            const isSelected = selectedId === item.id;

            // Highlight selected marker with ring
            const markerHtml = `
              <div style="
                width:20px;height:20px;border-radius:50%;background:${color};
                border:2px solid #fff;box-shadow:0 0 15px ${color};
                ${isSelected ? `transform: scale(1.3); outline: 3px solid rgba(255,255,255,0.7);` : ''}
                transition: transform 0.2s ease;
              "></div>
            `;

            const icon = L.divIcon({
              className: "custom-div-icon",
              html: markerHtml,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            return (
              <Marker key={item.id || `m-${index}`} position={[lat, lng]} icon={icon}>
                <Popup className="custom-popup" closeButton={false}>
                  {renderPopupContent(item)}
                </Popup>
              </Marker>
            );
          })}
        </CG>
      );
    }

    return grievances.map((item, index) => {
      const lat = parseFloat(item.latitude ?? item.lat);
      const lng = parseFloat(item.longitude ?? item.lng);
      if (isNaN(lat) || isNaN(lng)) return null;

      const urgency = Number(item.urgency_score || 1);
      const color = getStatusColor(item.status);

      return (
        <CircleMarker
          key={item.id || `marker-${lat}-${lng}-${index}`}
          center={[lat, lng]}
          radius={getNormalizedRadius(urgency, 14)}
          pathOptions={{
            color: selectedId === item.id ? "#ffffff" : color,
            fillColor: color,
            fillOpacity: 0.9,
            weight: selectedId === item.id ? 3 : 2,
          }}
        >
          <Popup className="custom-popup" closeButton={false}>
            {renderPopupContent(item)}
          </Popup>
        </CircleMarker>
      );
    });
  };

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "500px", position: "relative", zIndex: 0 }}>
      {/* Dark overlay to increase contrast if needed */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,14,26,0.2)', zIndex: 400, pointerEvents: 'none' }} />

      <MapContainer
        key={typeof window !== "undefined" ? "leaflet-map-mounted" : "leaflet-map-init"}
        center={defaultCenter}
        zoom={14}
        scrollWheelZoom={true}
        zoomControl={false} // We can add custom zoom controls if wanted
        style={{ height: "100%", width: "100%", background: "#0a0e1a" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Dark CartoDB
        />

        <ChangeView markers={grievances} selectedId={selectedId} />
        {grievances && renderMarkers()}
      </MapContainer>
    </div>
  );
}
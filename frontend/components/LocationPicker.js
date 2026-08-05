"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix standard Leaflet icon paths in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function MapClickHandler({ setPosition, onLocationChange }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
            onLocationChange(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

export default function LocationPicker({ lat, lng, onLocationChange }) {
    const defaultCenter = [22.5726, 88.3639]; // Default to Kolkata or user's city
    const [position, setPosition] = useState(
        lat && lng ? { lat, lng } : null
    );

    const mapRef = useRef(null);

    useEffect(() => {
        if (lat && lng && mapRef.current) {
            const newPos = { lat, lng };
            setPosition(newPos);
            mapRef.current.flyTo(newPos, 16);
        }
    }, [lat, lng]);

    const customIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 10px rgba(16,185,129,0.5);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });

    return (
        <div style={{ height: "250px", width: "100%", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(148, 163, 184, 0.2)" }}>
            <MapContainer
                center={position || defaultCenter}
                zoom={position ? 16 : 12}
                style={{ height: "100%", width: "100%" }}
                ref={mapRef}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Dark theme tile layer
                />
                <MapClickHandler setPosition={setPosition} onLocationChange={onLocationChange} />
                {position && <Marker position={position} icon={customIcon} />}
            </MapContainer>
        </div>
    );
}

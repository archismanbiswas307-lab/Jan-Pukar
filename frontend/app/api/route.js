import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";

const defaultClusterId = process.env.NEXT_PUBLIC_SUPABASE_CLUSTER_ID || process.env.SUPABASE_CLUSTER_ID;

const resolveClusterId = async () => {
  if (defaultClusterId) return defaultClusterId;

  const { data, error } = await supabase.from("clusters").select("id").limit(1).single();
  if (error || !data?.id) {
    console.error("Could not resolve cluster_id:", error);
    return null;
  }

  return data.id;
};

const analyzeGrievance = (text = "") => {
  const lower = String(text).toLowerCase();

  if (/(bomb|blast|fire|explosion|gas leak|collapse|accident|terror|weapon|shooting)/.test(lower)) {
    return { category: "Public Safety", urgency: 5, title: "Emergency Incident Report" };
  }

  if (/(short circuit|spark|live wire|transformer|electric pole|power outage)/.test(lower)) {
    return {
      category: "Electricity",
      urgency: /spark|wire|live/.test(lower) ? 5 : 4,
      title: "Electrical Hazard Report",
    };
  }

  if (/(pothole|road broken|traffic jam|flyover|street light)/.test(lower)) {
    return {
      category: "Roads & Traffic",
      urgency: /pothole|broken/.test(lower) ? 4 : 3,
      title: "Road Infrastructure Grievance",
    };
  }

  if (/(water leak|pipeline|sewage|drain overflow|waterlogging|no water)/.test(lower)) {
    return {
      category: "Water & Sewage",
      urgency: /overflow|waterlogging/.test(lower) ? 4 : 3,
      title: "Water Utility Report",
    };
  }

  if (/(garbage|trash|waste|stink|smell|dump|cleaning)/.test(lower)) {
    return {
      category: "Sanitation",
      urgency: /overflowing|stink/.test(lower) ? 3 : 2,
      title: "Sanitation Grievance",
    };
  }

  return { category: "General", urgency: 2, title: "General Municipal Grievance" };
};

const findNearbyDuplicate = async (lat, lng, category) => {
  try {
    const { data, error } = await supabase
      .from("grievances")
      .select("id, latitude, longitude, urgency_score, status")
      .neq("status", "Resolved")
      .eq("category", category)
      .limit(50);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    return rows.find((row) => {
      const rowLat = Number(row?.latitude);
      const rowLng = Number(row?.longitude);
      if (!Number.isFinite(rowLat) || !Number.isFinite(rowLng)) return false;
      const distanceKm = Math.sqrt((rowLat - lat) ** 2 + (rowLng - lng) ** 2) * 111;
      return distanceKm <= 0.2;
    });
  } catch (err) {
    console.warn("Duplicate check skipped:", err?.message || err);
    return null;
  }
};

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("RECEIVED TELEGRAM PAYLOAD:", JSON.stringify(body, null, 2));

    const message = body.message;
    if (!message) {
      console.log("No message object found in payload");
      return NextResponse.json({ status: "ignored" });
    }

    const text = message.text || message.caption || message.venue?.title || "Telegram Grievance";
    const location = message.location || message.venue?.location;
    if (!location) {
      console.log("Missing location for Telegram complaint, ignoring payload.");
      return NextResponse.json({ status: "missing_location" }, { status: 400 });
    }

    const lat = location.latitude ?? location.lat;
    const lng = location.longitude ?? location.lng;
    if (lat == null || lng == null) {
      console.log("Incomplete location received for Telegram complaint.");
      return NextResponse.json({ status: "missing_location" }, { status: 400 });
    }

    const clusterId = await resolveClusterId();
    const analysis = analyzeGrievance(text);
    const duplicate = await findNearbyDuplicate(parseFloat(lat), parseFloat(lng), analysis.category);

    if (duplicate) {
      return NextResponse.json({
        status: "duplicate_detected",
        duplicateId: duplicate.id,
        category: analysis.category,
      });
    }

    const { data, error } = await supabase.from("grievances").insert([
      {
        user_id: `telegram_${message.from?.id || "unknown"}`,
        title: analysis.title,
        description: text,
        category: analysis.category,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        urgency_score: analysis.urgency,
        cluster_id: clusterId,
        status: "Pending",
      },
    ]);

    if (error) {
      console.error("SUPABASE ERROR:", error);
      return NextResponse.json({ status: "db_error", error }, { status: 500 });
    }

    console.log("SUCCESSFULLY INSERTED:", data);
    return NextResponse.json({ status: "success" });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return NextResponse.json({ status: "server_error" }, { status: 500 });
  }
}
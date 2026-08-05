"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import TelegramLinkClient from "./TelegramLinkClient";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!currentSession) {
        router.push("/login");
        return;
      }
      if (mounted) setSession(currentSession);

      try {
        const userId = currentSession.user.id;
        const { data: prof, error } = await supabase
          .from("profiles")
          .select("id, email, telegram_chat_id")
          .eq("id", userId)
          .single();
        if (error) throw error;
        if (mounted) setProfile(prof);
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) return <div className="p-8">Loading…</div>;
  if (error)
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold mb-4">Profile</h1>
          <p className="text-sm text-red-600">Error loading profile: {error.message}</p>
        </div>
      </main>
    );

  const userId = session.user.id;
  const deepLink = `https://t.me/JanPukarBot?start=${encodeURIComponent(userId)}`;

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Profile</h1>

        <div className="p-4 bg-white rounded shadow">
          <dl>
            <div>
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="text-sm font-medium">{profile?.email || session.user.email}</dd>
            </div>
            <div className="mt-2">
              <dt className="text-sm text-slate-500">User id</dt>
              <dd className="text-sm font-mono text-xs">{profile?.id}</dd>
            </div>
          </dl>
        </div>

        <TelegramLinkClient deepLink={deepLink} telegramChatId={profile?.telegram_chat_id} />
      </div>
    </main>
  );
}

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
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, email, telegram_chat_id")
          .eq("id", userId)
          .single();
        if (profErr) throw profErr;
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

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading session...</div>;

  if (error) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '40px 16px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '24px' }}>Profile Error</h1>
          <div style={{ padding: '24px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '12px', color: '#fb7185' }}>
            {error.message}
          </div>
        </div>
      </main>
    );
  }

  const userId = session.user.id;
  const deepLink = `https://t.me/JanPukarBot?start=${encodeURIComponent(userId)}`;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '40px 16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }} className="animate-fade-in-up">

        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>
          Admin <span className="gradient-text">Profile</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
          Manage your account settings and Telegram notifications.
        </p>

        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>Account Details</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Email Address</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>{profile?.email || session.user.email}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Admin ID</div>
              <div style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{profile?.id || userId}</div>
            </div>
          </div>
        </div>

        <TelegramLinkClient deepLink={deepLink} telegramChatId={profile?.telegram_chat_id} />

      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function TelegramLinkClient({ deepLink, telegramChatId }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("Clipboard copy failed:", e);
    }
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ fontSize: '1.5rem' }}>✈️</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Telegram Integration</h2>
      </div>

      {telegramChatId ? (
        <div style={{
          padding: '16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div>✅</div>
          <div>
            <div style={{ fontWeight: 600 }}>Account Linked</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>Chat ID: {telegramChatId}</div>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
            Link your Telegram account to securely receive instant incident alerts directly to your phone.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '0.9rem' }}
            >
              Open JanPukar Bot
            </a>
            <button
              onClick={handleCopy}
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              📋 {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>

          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'inline-block' }}>
            <img
              src={`https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(deepLink)}`}
              alt="QR Code"
              style={{ display: 'block', borderRadius: '8px' }}
            />
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Scan to link</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <button
          onClick={handleSignOut}
          style={{
            background: 'transparent', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185',
            padding: '8px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          Sign Out of Admin Session
        </button>
      </div>
    </div>
  );
}

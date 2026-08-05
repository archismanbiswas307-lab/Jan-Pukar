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
      // navigate client-side to login
      window.location.href = "/login";
    }
  }

  return (
    <div className="mt-4 p-4 border rounded bg-white">
      <h3 className="font-semibold">Telegram linking</h3>
      {telegramChatId ? (
        <p className="text-sm text-green-700">Linked (chat id: {telegramChatId})</p>
      ) : (
        <div className="mt-2">
          <p className="text-sm mb-2">Not linked yet. Open this link in Telegram to link your account:</p>
          <div className="flex items-center gap-3">
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
              aria-label="Open JanPukar bot in Telegram"
            >
              Open JanPukarBot
            </a>
            <button onClick={handleCopy} className="text-sm bg-gray-100 px-2 py-1 rounded" aria-label="Copy Telegram deep link">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <div className="mt-3">
            <img
              src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(deepLink)}`}
              alt={`QR code for ${deepLink}`}
              width={200}
              height={200}
            />
          </div>
        </div>
      )}

      <div className="mt-4">
        <button onClick={handleSignOut} className="text-sm text-red-600" aria-label="Sign out">Sign out</button>
      </div>
    </div>
  );
}

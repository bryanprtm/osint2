import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function digits(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function commandKeyword(command: unknown): string {
  const first = String(command ?? "").toLowerCase().split(/\s+/)[0] ?? "";
  return first.replace(/^\//, "");
}

function scoreReplyMatch(
  pending: { feature_id: string; command_sent: string; query: string; created_at: string },
  message: string,
  replyTime: number,
): number {
  const sentAt = new Date(pending.created_at).getTime();
  const diffMs = replyTime - sentAt;
  if (!Number.isFinite(sentAt) || diffMs < -5_000 || diffMs > 30 * 60 * 1000) return -1;

  const lower = message.toLowerCase();
  const queryText = String(pending.query ?? "").toLowerCase().trim();
  const commandText = commandKeyword(pending.command_sent);
  const featureText = String(pending.feature_id ?? "").toLowerCase().trim();
  const recency = Math.max(0, 30 * 60 * 1000 - diffMs) / 1000;

  if (queryText && lower.includes(queryText)) return 10_000 + queryText.length * 100 + recency;
  if (commandText && lower.includes(commandText)) return 5_000 + commandText.length * 50 + recency;
  if (featureText && lower.includes(featureText)) return 3_000 + featureText.length * 25 + recency;
  return 100 + recency;
}

function pickBestPendingForReply<T extends { feature_id: string; command_sent: string; query: string; created_at: string }>(
  pending: T[],
  message: string,
  replyTime: number,
): T | undefined {
  return pending
    .map((row) => ({ row, score: scoreReplyMatch(row, message, replyTime) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime())[0]?.row;
}

/**
 * Extract sender + message + isFromBot from Wablas / Fonnte webhook payload.
 * Wablas payload variants (both flat & nested "data"):
 *   { sender: "628xxx", message: "...", isGroup: false, fromMe: false, phone: "628xxx", ... }
 *   { data: { phone, message, sender, isFromMe, ... } }
 * Fonnte payload:
 *   { device, sender, message, member, name, ... }
 */
function parsePayload(p: any): { sender: string; message: string; fromMe: boolean; chatPhone: string; isGroup: boolean } {
  const d = p?.data && typeof p.data === "object" ? p.data : p ?? {};
  const sender = digits(d.sender ?? d.phone ?? d.from ?? p?.sender ?? p?.phone ?? "");
  // Wablas can put the actual chat/contact number in `phone`, while `sender`
  // can be the connected device/account. Keep both so replies can be matched.
  const chatPhone = digits(d.phone ?? p?.phone ?? d.pushName ?? p?.pushName ?? "");
  const message = String(d.message ?? d.body ?? d.text ?? p?.message ?? p?.body ?? "").trim();
  const fromMe = boolish(d.isFromMe ?? d.fromMe ?? d.from_me ?? p?.fromMe ?? p?.isFromMe ?? false);
  const isGroup = boolish(d.isGroup ?? p?.isGroup ?? false);
  return { sender, message, fromMe, chatPhone, isGroup };
}

export const Route = createFileRoute("/api/public/wa/incoming")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        // Ping endpoint — verifikasi bahwa URL webhook reachable.
        const url = new URL(request.url);
        const key = url.searchParams.get("key") ?? "";
        const expected = process.env.WA_WEBHOOK_KEY ?? "";
        if (!expected || key !== expected) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }
        return json({ ok: true, message: "wa webhook alive" });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("key") ?? request.headers.get("x-webhook-key") ?? "";
        const expected = process.env.WA_WEBHOOK_KEY ?? "";
        if (!expected) return json({ ok: false, error: "webhook not configured" }, 500);
        if (key !== expected) return json({ ok: false, error: "unauthorized" }, 401);

        // Baca body — bisa JSON atau form-urlencoded (Fonnte kadang form-urlencoded).
        const ctype = (request.headers.get("content-type") ?? "").toLowerCase();
        let payload: any = {};
        try {
          if (ctype.includes("application/json")) {
            payload = await request.json();
          } else if (ctype.includes("application/x-www-form-urlencoded") || ctype.includes("multipart/form-data")) {
            const fd = await request.formData();
            payload = Object.fromEntries(fd.entries());
          } else {
            const raw = await request.text();
            try { payload = JSON.parse(raw); } catch { payload = { raw }; }
          }
        } catch (e) {
          return json({ ok: false, error: `bad body: ${(e as Error).message}` }, 400);
        }

        const { sender, message, fromMe, chatPhone, isGroup } = parsePayload(payload);

        // Abaikan pesan kosong.
        if (!message) return json({ ok: true, skipped: "empty" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Ambil setting nomor bot (opsional).
        const { data: setting } = await supabaseAdmin
          .from("wa_gateway_settings")
          .select("bot_number")
          .eq("id", 1)
          .maybeSingle();
        const botNumber = digits((setting as any)?.bot_number ?? "");
        const numberMatches = (a: string, b: string) => !!a && !!b && (a === b || a.endsWith(b) || b.endsWith(a));
        const senderMatchesBot = !!botNumber && (numberMatches(sender, botNumber) || numberMatches(chatPhone, botNumber));
        // Di Wablas, field `phone` bisa berisi nomor chat/contact bot yang kita kirimi pesan.
        const devicePhone = chatPhone;
        // Skip hanya kalau pesan echo dari user ke device kita (bukan dari bot balasan).
        // Kalau fromMe=true (device kita yang mengirim, artinya bot balasan) → jangan skip.
        const senderIsOurDevice = !!devicePhone && !!sender && sender === devicePhone && !fromMe;
        const isDirectBotReply = !isGroup && (senderMatchesBot || fromMe || !botNumber);

        let matchedId: string | null = null;
        let matchReason = "no_pending";

        if (isGroup) {
          matchReason = "group_message_ignored";
        } else if (!senderIsOurDevice) {
          const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const { data: pendingAll } = await supabaseAdmin
            .from("wa_send_log")
            .select("id, feature_id, command_sent, query, created_at")
            .eq("status", "sent")
            .is("reply", null)
            .gte("created_at", cutoff)
            .order("created_at", { ascending: true })
            .limit(30);

          const pending = (pendingAll ?? []) as Array<{ id: string; feature_id: string; command_sent: string; query: string; created_at: string }>;
          if (pending.length > 0) {
            const hit = pickBestPendingForReply(pending, message, Date.now());
            if (hit) {
              const lower = message.toLowerCase();
              if (String(hit.query ?? "").trim() && lower.includes(String(hit.query).toLowerCase().trim())) {
                matchReason = "best_query_recency";
              } else if (commandKeyword(hit.command_sent) && lower.includes(commandKeyword(hit.command_sent))) {
                matchReason = "best_command_recency";
              } else if (String(hit.feature_id ?? "").trim() && lower.includes(String(hit.feature_id).toLowerCase().trim())) {
                matchReason = "best_feature_recency";
              } else if (isDirectBotReply) {
                matchReason = "best_direct_recency_fallback";
              } else {
                matchReason = "best_time_window";
              }
            }

            if (hit) {
              matchedId = hit.id;
              await supabaseAdmin
                .from("wa_send_log")
                .update({ reply: message, reply_at: new Date().toISOString(), reply_sender: chatPhone || sender })
                .eq("id", matchedId);
            } else {
              matchReason = "no_strategy_matched";
            }
          }
        } else {
          matchReason = "sender_is_our_device";
        }

        await supabaseAdmin.from("wa_incoming").insert({
          sender,
          message,
          raw: payload,
          matched_log_id: matchedId,
        });

        return json({ ok: true, matched: matchedId, matchReason, sender, chatPhone, devicePhone, fromMe, isGroup, botNumber });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

/**
 * Extract sender + message + isFromBot from Wablas / Fonnte webhook payload.
 * Wablas payload variants (both flat & nested "data"):
 *   { sender: "628xxx", message: "...", isGroup: false, fromMe: false, phone: "628xxx", ... }
 *   { data: { phone, message, sender, isFromMe, ... } }
 * Fonnte payload:
 *   { device, sender, message, member, name, ... }
 */
function parsePayload(p: any): { sender: string; message: string; fromMe: boolean } {
  const d = p?.data && typeof p.data === "object" ? p.data : p ?? {};
  const sender = digits(d.sender ?? d.phone ?? d.from ?? p?.sender ?? p?.phone ?? "");
  const message = String(d.message ?? d.body ?? d.text ?? p?.message ?? p?.body ?? "").trim();
  const fromMeRaw = d.isFromMe ?? d.fromMe ?? d.from_me ?? p?.fromMe ?? p?.isFromMe ?? false;
  const fromMe = fromMeRaw === true || fromMeRaw === "true" || fromMeRaw === 1 || fromMeRaw === "1";
  return { sender, message, fromMe };
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

        const { sender, message, fromMe } = parsePayload(payload);

        // Abaikan pesan kosong dan pesan yang dikirim oleh bot itu sendiri (echo).
        if (!message) return json({ ok: true, skipped: "empty" });
        if (fromMe) return json({ ok: true, skipped: "from-me" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Ambil setting: nomor bot & apakah pengirim = bot
        const { data: setting } = await supabaseAdmin
          .from("wa_gateway_settings")
          .select("bot_number")
          .eq("id", 1)
          .maybeSingle();
        const botNumber = digits((setting as any)?.bot_number ?? "");
        const senderIsBot = botNumber && sender && (sender === botNumber || sender.endsWith(botNumber) || botNumber.endsWith(sender));

        // Cari log kirim terbaru dalam 10 menit yang belum ada reply.
        let matchedId: string | null = null;
        if (senderIsBot) {
          const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: pending } = await supabaseAdmin
            .from("wa_send_log")
            .select("id")
            .eq("status", "sent")
            .is("reply", null)
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(1);
          if (pending && pending.length > 0) {
            matchedId = (pending[0] as any).id as string;
            await supabaseAdmin
              .from("wa_send_log")
              .update({ reply: message, reply_at: new Date().toISOString(), reply_sender: sender })
              .eq("id", matchedId);
          }
        }

        await supabaseAdmin.from("wa_incoming").insert({
          sender,
          message,
          raw: payload,
          matched_log_id: matchedId,
        });

        return json({ ok: true, matched: matchedId });
      },
    },
  },
});

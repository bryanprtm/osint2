import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Signature",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function safeEqualHex(a: string, b: string): boolean {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

export const Route = createFileRoute("/api/public/tg/incoming")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async () => json({ ok: true, message: "tg bridge callback alive" }),

      POST: async ({ request }) => {
        const secret = process.env.TG_BRIDGE_SECRET ?? "";
        if (!secret) return json({ ok: false, error: "bridge secret not configured" }, 500);

        const raw = await request.text();
        const sig = request.headers.get("X-Bridge-Signature") ?? "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        if (!safeEqualHex(sig, expected)) return json({ ok: false, error: "invalid signature" }, 401);

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }

        const requestId = String(payload?.requestId ?? "");
        if (!requestId) return json({ ok: false, error: "missing requestId" }, 400);

        const reply = String(payload?.reply ?? "").trim();
        const okFlag = payload?.ok === true;
        const errText = payload?.error ? String(payload.error) : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const patch = okFlag && reply
          ? {
              reply_at: new Date().toISOString(),
              reply_sender: "@enigmatoolsbot",
              reply,
              status: "sent",
            }
          : {
              reply_at: new Date().toISOString(),
              reply_sender: "@enigmatoolsbot",
              status: "failed",
              error: errText ?? "bridge returned no reply",
            };

        const { error } = await supabaseAdmin.from("wa_send_log").update(patch).eq("id", requestId);
        if (error) return json({ ok: false, error: error.message }, 500);

        return json({ ok: true, requestId });
      },
    },
  },
});

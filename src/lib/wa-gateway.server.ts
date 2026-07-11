import { pickBestWaReplyMatch, scoreWaReplyMatch } from "@/lib/wa-reply-match";

export type WaProvider = "fonnte" | "wablas";

export type WaSettingsPublic = {
  provider: WaProvider;
  bot_number: string;
  subdomain: string;
  enabled: boolean;
  commands: Record<string, string>;
  has_token: boolean;
  has_secret: boolean;
  updated_at: string;
};

export function sanitizePhone(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function numberMatches(a: unknown, b: unknown): boolean {
  const aa = sanitizePhone(a);
  const bb = sanitizePhone(b);
  return !!aa && !!bb && (aa === bb || aa.endsWith(bb) || bb.endsWith(aa));
}

function incomingMeta(row: any) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
  const d = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  return {
    sender: sanitizePhone(row?.sender ?? d?.sender ?? d?.from ?? raw?.sender ?? raw?.from),
    chatPhone: sanitizePhone(d?.phone ?? raw?.phone ?? d?.pushName ?? raw?.pushName),
    message: String(row?.message ?? d?.message ?? d?.body ?? d?.text ?? raw?.message ?? "").trim(),
    isGroup: boolish(d?.isGroup ?? raw?.isGroup),
    fromMe: boolish(d?.isFromMe ?? d?.fromMe ?? d?.from_me ?? raw?.isFromMe ?? raw?.fromMe),
  };
}

export async function reconcileUnmatchedWaReplies(logId?: string, featureId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: setting } = await supabaseAdmin
    .from("wa_gateway_settings")
    .select("bot_number")
    .eq("id", 1)
    .maybeSingle();
  const botNumber = sanitizePhone((setting as any)?.bot_number);
  if (!botNumber) return { updated: 0 };

  let pendingQuery = supabaseAdmin
    .from("wa_send_log")
    .select("id, feature_id, command_sent, query, created_at")
    .eq("status", "sent")
    .is("reply", null)
    .order("created_at", { ascending: true });

  if (logId) {
    pendingQuery = pendingQuery.eq("id", logId).limit(1);
  } else {
    pendingQuery = pendingQuery
      .gte("created_at", new Date(Date.now() - 45 * 60 * 1000).toISOString())
      .limit(100);
    if (featureId) pendingQuery = pendingQuery.eq("feature_id", featureId);
  }

  const { data: pendingRows, error: pendingError } = await pendingQuery;
  if (pendingError) throw new Error(pendingError.message);
  const pending = (pendingRows ?? []) as Array<{
    id: string;
    feature_id: string;
    command_sent: string;
    query: string;
    created_at: string;
  }>;
  if (pending.length === 0) return repairMisroutedWaReplies(logId, featureId);

  const earliestMs = Math.min(...pending.map((p) => new Date(p.created_at).getTime()));
  const { data: incomingRows, error: incomingError } = await supabaseAdmin
    .from("wa_incoming")
    .select("id, sender, message, created_at, raw")
    .is("matched_log_id", null)
    .gte("created_at", new Date(earliestMs - 5_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(300);
  if (incomingError) throw new Error(incomingError.message);

  const incoming = ((incomingRows ?? []) as Array<any>)
    .map((row) => ({ row, meta: incomingMeta(row), time: new Date(row.created_at).getTime() }))
    .filter(({ meta }) => !meta.isGroup && meta.message && (numberMatches(meta.chatPhone, botNumber) || numberMatches(meta.sender, botNumber) || meta.fromMe));

  let updated = 0;
  const usedPendingIds = new Set<string>();
  for (const hit of incoming) {
    const availablePending = pending.filter((p) => !usedPendingIds.has(p.id));
    const p = pickBestWaReplyMatch(availablePending, hit.meta.message, hit.time, true);
    if (!p) continue;

    const replyAt = new Date(hit.time).toISOString();
    const replySender = hit.meta.chatPhone || hit.meta.sender;
    const { error: updateError } = await supabaseAdmin
      .from("wa_send_log")
      .update({ reply: hit.meta.message, reply_at: replyAt, reply_sender: replySender })
      .eq("id", p.id)
      .is("reply", null);
    if (updateError) throw new Error(updateError.message);
    await supabaseAdmin.from("wa_incoming").update({ matched_log_id: p.id }).eq("id", hit.row.id);
    usedPendingIds.add(p.id);
    updated += 1;
  }
  const repaired = await repairMisroutedWaReplies(logId, featureId);
  return { updated: updated + repaired.updated };
}

async function repairMisroutedWaReplies(targetLogId?: string, targetFeatureId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data: incomingRows, error: incomingError } = await supabaseAdmin
    .from("wa_incoming")
    .select("id, sender, message, created_at, raw, matched_log_id")
    .not("matched_log_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(300);
  if (incomingError) throw new Error(incomingError.message);
  if (!incomingRows || incomingRows.length === 0) return { updated: 0 };

  const { data: logRows, error: logError } = await supabaseAdmin
    .from("wa_send_log")
    .select("id, feature_id, command_sent, query, created_at, reply")
    .eq("status", "sent")
    .gte("created_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(500);
  if (logError) throw new Error(logError.message);

  const logs = (logRows ?? []) as Array<{
    id: string;
    feature_id: string;
    command_sent: string;
    query: string;
    created_at: string;
    reply: string | null;
  }>;
  if (logs.length === 0) return { updated: 0 };

  let updated = 0;
  for (const row of incomingRows as Array<any>) {
    const meta = incomingMeta(row);
    if (!meta.message || meta.isGroup) continue;

    const replyTime = new Date(row.created_at).getTime();
    const current = logs.find((log) => log.id === row.matched_log_id);
    if (!current) continue;

    const candidates = logs.filter((log) => {
      if (log.id === current.id) return true;
      if (log.reply) return false;
      const sentAt = new Date(log.created_at).getTime();
      return Number.isFinite(sentAt) && sentAt <= replyTime + 5_000 && replyTime - sentAt <= 30 * 60 * 1000;
    });
    const best = pickBestWaReplyMatch(candidates, meta.message, replyTime, false);
    if (!best || best.id === current.id) continue;
    if (targetLogId && best.id !== targetLogId) continue;
    if (targetFeatureId && best.feature_id !== targetFeatureId) continue;

    const bestScore = scoreWaReplyMatch(best, meta.message, replyTime, false);
    const currentScore = scoreWaReplyMatch(current, meta.message, replyTime, false);
    if (bestScore < 10_000 || bestScore <= currentScore + 1_000) continue;

    const replyAt = new Date(replyTime).toISOString();
    const replySender = meta.chatPhone || meta.sender;
    const { error: moveError } = await supabaseAdmin
      .from("wa_send_log")
      .update({ reply: meta.message, reply_at: replyAt, reply_sender: replySender })
      .eq("id", best.id)
      .is("reply", null);
    if (moveError) throw new Error(moveError.message);

    if (current.reply === meta.message) {
      const { error: clearError } = await supabaseAdmin
        .from("wa_send_log")
        .update({ reply: null, reply_at: null, reply_sender: null })
        .eq("id", current.id);
      if (clearError) throw new Error(clearError.message);
      current.reply = null;
    }

    const { error: incomingUpdateError } = await supabaseAdmin
      .from("wa_incoming")
      .update({ matched_log_id: best.id })
      .eq("id", row.id);
    if (incomingUpdateError) throw new Error(incomingUpdateError.message);

    best.reply = meta.message;
    updated += 1;
  }

  return { updated };
}

export function sanitizeQuery(featureId: string, q: string): string {
  const digitOnly = new Set(["nik", "kk", "bpjs", "imei", "regnik", "nik2photo", "regphone"]);
  if (digitOnly.has(featureId)) return q.replace(/\D+/g, "");
  return q.trim();
}

export async function loadRow() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("wa_gateway_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    await supabaseAdmin.from("wa_gateway_settings").insert({ id: 1 });
    const { data: d2 } = await supabaseAdmin.from("wa_gateway_settings").select("*").eq("id", 1).single();
    return d2 as any;
  }
  return data as any;
}

export function toPublic(row: any): WaSettingsPublic {
  return {
    provider: (row.provider as WaProvider) ?? "fonnte",
    bot_number: row.bot_number ?? "",
    subdomain: row.subdomain ?? "",
    enabled: !!row.enabled,
    commands: (row.commands as Record<string, string>) ?? {},
    has_token: !!(row.api_token && String(row.api_token).length > 0),
    has_secret: !!(row.secret_key && String(row.secret_key).length > 0),
    updated_at: row.updated_at,
  };
}

export function baseUrl(): string {
  return process.env.VITE_PUBLISHED_URL || process.env.PUBLISHED_URL || "https://osint2.lovable.app";
}

export async function sendViaFonnte(token: string, target: string, message: string) {
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ target, message, countryCode: "62" }).toString(),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function sendViaWablas(
  token: string,
  secret: string,
  subdomain: string,
  target: string,
  message: string,
) {
  let sub = (subdomain || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  let realToken = token;
  if (!sub && token.includes("|")) {
    const [s, t] = token.split("|");
    if (s) sub = s.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (t) realToken = t.trim();
  }
  if (!sub) sub = "solo";
  const auth = secret && secret.length > 0 ? `${realToken}.${secret}` : realToken;
  const res = await fetch(`https://${sub}.wablas.com/api/send-message`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ phone: target, message }).toString(),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

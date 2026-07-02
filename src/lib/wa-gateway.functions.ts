import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export type WaSendLogRow = {
  id: string;
  username: string | null;
  feature_id: string;
  query: string;
  command_sent: string;
  status: string;
  provider: string;
  provider_response: string | null;
  error: string | null;
  created_at: string;
};

export const DEFAULT_WA_COMMANDS: Record<string, string> = {
  nik: "/nikdetail",
  kk: "/kkdetail",
  nama: "/nama",
  bpjs: "/bpjs",
  nopol: "/plat",
  imei: "/imei",
  mahasiswa: "/mhs",
  guru: "/guru",
};

function sanitizePhone(v: unknown): string {
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

function commandKeyword(command: unknown): string {
  const first = String(command ?? "").toLowerCase().split(/\s+/)[0] ?? "";
  return first.replace(/^\//, "");
}

async function reconcileUnmatchedWaReplies(logId?: string) {
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
      .gte("created_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
      .limit(100);
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
  if (pending.length === 0) return { updated: 0 };

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
  const usedIncomingIds = new Set<string>();
  for (const p of pending) {
    const sentAt = new Date(p.created_at).getTime();
    const candidates = incoming.filter(({ row, time }) => {
      return !usedIncomingIds.has(row.id) && time >= sentAt - 5_000 && time <= sentAt + 30 * 60 * 1000;
    });
    if (candidates.length === 0) continue;

    const queryText = String(p.query ?? "").toLowerCase().trim();
    const commandText = commandKeyword(p.command_sent);
    const featureText = String(p.feature_id ?? "").toLowerCase().trim();
    let hit = queryText ? candidates.find(({ meta }) => meta.message.toLowerCase().includes(queryText)) : undefined;
    if (!hit && commandText) hit = candidates.find(({ meta }) => meta.message.toLowerCase().includes(commandText));
    if (!hit && featureText) hit = candidates.find(({ meta }) => meta.message.toLowerCase().includes(featureText));
    if (!hit) hit = candidates[0];
    if (!hit) continue;

    const replyAt = new Date(hit.time).toISOString();
    const replySender = hit.meta.chatPhone || hit.meta.sender;
    const { error: updateError } = await supabaseAdmin
      .from("wa_send_log")
      .update({ reply: hit.meta.message, reply_at: replyAt, reply_sender: replySender })
      .eq("id", p.id)
      .is("reply", null);
    if (updateError) throw new Error(updateError.message);
    await supabaseAdmin.from("wa_incoming").update({ matched_log_id: p.id }).eq("id", hit.row.id);
    usedIncomingIds.add(hit.row.id);
    updated += 1;
  }
  return { updated };
}

function sanitizeQuery(featureId: string, q: string): string {
  const digitOnly = new Set(["nik", "kk", "bpjs", "imei", "regnik", "nik2photo", "regphone"]);
  if (digitOnly.has(featureId)) return q.replace(/\D+/g, "");
  return q.trim();
}

async function loadRow() {
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

function toPublic(row: any): WaSettingsPublic {
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

// ============= READ =============
export const getWaSettings = createServerFn({ method: "GET" }).handler(async () => {
  const row = await loadRow();
  return { settings: toPublic(row) };
});

function baseUrl(): string {
  return process.env.VITE_PUBLISHED_URL || process.env.PUBLISHED_URL || "https://osint2.lovable.app";
}

export const getWaWebhookUrl = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.WA_WEBHOOK_KEY ?? "";
  if (!key) return { url: null };
  return { url: `${baseUrl()}/api/public/wa/incoming?key=${key}` };
});

// ============= SAVE =============
export const saveWaSettings = createServerFn({ method: "POST" })
  .inputValidator((input: {
    provider: WaProvider;
    bot_number: string;
    subdomain?: string;
    enabled: boolean;
    commands: Record<string, string>;
    api_token?: string; // optional — empty string keeps existing
    secret_key?: string; // optional — empty string keeps existing
  }) =>
    z.object({
      provider: z.enum(["fonnte", "wablas"]),
      bot_number: z.string().max(30),
      subdomain: z.string().max(60).optional(),
      enabled: z.boolean(),
      commands: z.record(z.string(), z.string().max(60)),
      api_token: z.string().max(500).optional(),
      secret_key: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      provider: string;
      bot_number: string;
      subdomain: string;
      enabled: boolean;
      commands: Record<string, string>;
      updated_at: string;
      api_token?: string;
      secret_key?: string;
    } = {
      provider: data.provider,
      bot_number: sanitizePhone(data.bot_number),
      subdomain: (data.subdomain ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
      enabled: data.enabled,
      commands: data.commands,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.api_token === "string" && data.api_token.trim().length > 0) {
      patch.api_token = data.api_token.trim();
    }
    if (typeof data.secret_key === "string" && data.secret_key.trim().length > 0) {
      patch.secret_key = data.secret_key.trim();
    }
    const { error } = await supabaseAdmin.from("wa_gateway_settings").update(patch).eq("id", 1);
    if (error) return { ok: false as const, error: error.message };
    const row = await loadRow();
    return { ok: true as const, settings: toPublic(row) };
  });

// ============= SEND =============
async function sendViaFonnte(token: string, target: string, message: string) {
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ target, message, countryCode: "62" }).toString(),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function sendViaWablas(
  token: string,
  secret: string,
  subdomain: string,
  target: string,
  message: string,
) {
  // Wablas: POST https://<subdomain>.wablas.com/api/send-message
  // Auth header is "<token>.<secret>" when secret key is configured (mode "secret key + IP whitelist").
  // Fallback to token-only when secret is empty (device tanpa proteksi secret key).
  let sub = (subdomain || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  let realToken = token;
  // Backward compat: dulu subdomain di-embed dalam token sebagai "sub|token".
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

export const sendWaLookup = createServerFn({ method: "POST" })
  .inputValidator((input: {
    featureId: string;
    query: string;
    username?: string;
  }) =>
    z.object({
      featureId: z.string().min(1).max(80),
      query: z.string().min(1).max(200),
      username: z.string().max(80).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadRow();
    if (!row.enabled) return { ok: false as const, message: "Integrasi WhatsApp belum diaktifkan admin." };
    const target = sanitizePhone(row.bot_number);
    if (!target) return { ok: false as const, message: "Nomor bot belum dikonfigurasi." };
    if (!row.api_token) return { ok: false as const, message: "Token API gateway belum diisi." };

    const cmd = ((row.commands as Record<string, string>) || {})[data.featureId];
    if (!cmd || !cmd.trim()) return { ok: false as const, message: "Perintah untuk modul ini belum diatur." };

    const q = sanitizeQuery(data.featureId, data.query);
    if (!q) return { ok: false as const, message: "Query kosong." };

    const message = `${cmd.trim()}${q}`;
    const provider = row.provider as WaProvider;

    let result: { ok: boolean; status: number; text: string };
    try {
      result = provider === "wablas"
        ? await sendViaWablas(row.api_token, row.secret_key ?? "", row.subdomain ?? "", target, message)
        : await sendViaFonnte(row.api_token, target, message);
    } catch (e) {
      const errMsg = (e as Error).message;
      await supabaseAdmin.from("wa_send_log").insert({
        username: data.username ?? null,
        feature_id: data.featureId, query: q, command_sent: message,
        status: "failed", provider, error: errMsg,
      });
      return { ok: false as const, message: `Gagal menghubungi gateway: ${errMsg}` };
    }

    const success = result.ok && !/error|invalid|failed/i.test(result.text.slice(0, 200));
    const { data: inserted } = await supabaseAdmin.from("wa_send_log").insert({
      username: data.username ?? null,
      feature_id: data.featureId, query: q, command_sent: message,
      status: success ? "sent" : "failed",
      provider,
      provider_response: result.text.slice(0, 2000),
      error: success ? null : `HTTP ${result.status}`,
    }).select("id").single();
    const logId = (inserted as any)?.id as string | undefined;

    return success
      ? { ok: true as const, message: `Perintah "${message}" terkirim ke ${target}.`, logId }
      : { ok: false as const, message: `Gateway menolak (HTTP ${result.status}): ${result.text.slice(0, 200)}`, logId };
  });

// ============= GET REPLY (polling) =============
export const getWaReply = createServerFn({ method: "POST" })
  .inputValidator((input: { logId: string }) =>
    z.object({ logId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await reconcileUnmatchedWaReplies(data.logId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("wa_send_log")
      .select("id, reply, reply_at, reply_sender")
      .eq("id", data.logId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false as const };
    return {
      found: true as const,
      reply: (row as any).reply as string | null,
      reply_at: (row as any).reply_at as string | null,
      reply_sender: (row as any).reply_sender as string | null,
    };
  });

// ============= LIST LOG =============
export const listWaSendLog = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number } | undefined) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("wa_send_log")
      .select("id, username, feature_id, query, command_sent, status, provider, provider_response, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as WaSendLogRow[] };
  });

// ============= MY HISTORY (per user + feature, dengan balasan) =============
export type WaHistoryRow = {
  id: string;
  feature_id: string;
  query: string;
  command_sent: string;
  status: string;
  reply: string | null;
  reply_at: string | null;
  reply_sender: string | null;
  created_at: string;
};

export const listMyWaHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { username?: string; featureId?: string; limit?: number }) =>
    z.object({
      username: z.string().max(80).optional(),
      featureId: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await reconcileUnmatchedWaReplies();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("wa_send_log")
      .select("id, feature_id, query, command_sent, status, reply, reply_at, reply_sender, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.username) q = q.eq("username", data.username);
    if (data.featureId) q = q.eq("feature_id", data.featureId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as WaHistoryRow[] };
  });

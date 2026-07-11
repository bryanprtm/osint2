import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WaProvider, WaSettingsPublic } from "@/lib/wa-gateway.server";

export type { WaProvider, WaSettingsPublic } from "@/lib/wa-gateway.server";

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

// ============= READ =============
export const getWaSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { loadRow: _load, toPublic: _pub } = await import("@/lib/wa-gateway.server");
  const row = await _load();
  return { settings: _pub(row) };
});

export const getWaWebhookUrl = createServerFn({ method: "GET" }).handler(async () => {
  const { baseUrl: _base } = await import("@/lib/wa-gateway.server");
  const key = process.env.WA_WEBHOOK_KEY ?? "";
  if (!key) return { url: null };
  return { url: `${_base()}/api/public/wa/incoming?key=${key}` };
});

// ============= SAVE =============
export const saveWaSettings = createServerFn({ method: "POST" })
  .inputValidator((input: {
    provider: WaProvider;
    bot_number: string;
    subdomain?: string;
    enabled: boolean;
    commands: Record<string, string>;
    api_token?: string;
    secret_key?: string;
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
    const helpers = await import("@/lib/wa-gateway.server");
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
      bot_number: helpers.sanitizePhone(data.bot_number),
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
    const row = await helpers.loadRow();
    return { ok: true as const, settings: helpers.toPublic(row) };
  });

// ============= SEND =============
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
    const helpers = await import("@/lib/wa-gateway.server");
    const row = await helpers.loadRow();
    if (!row.enabled) return { ok: false as const, message: "Integrasi WhatsApp belum diaktifkan admin." };
    const target = helpers.sanitizePhone(row.bot_number);
    if (!target) return { ok: false as const, message: "Nomor bot belum dikonfigurasi." };
    if (!row.api_token) return { ok: false as const, message: "Token API gateway belum diisi." };

    const cmd = ((row.commands as Record<string, string>) || {})[data.featureId];
    if (!cmd || !cmd.trim()) return { ok: false as const, message: "Perintah untuk modul ini belum diatur." };

    const q = helpers.sanitizeQuery(data.featureId, data.query);
    if (!q) return { ok: false as const, message: "Query kosong." };

    const message = `${cmd.trim()} ${q}`;
    const provider = row.provider as WaProvider;

    let result: { ok: boolean; status: number; text: string };
    try {
      result = provider === "wablas"
        ? await helpers.sendViaWablas(row.api_token, row.secret_key ?? "", row.subdomain ?? "", target, message)
        : await helpers.sendViaFonnte(row.api_token, target, message);
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
    const { reconcileUnmatchedWaReplies: _rec } = await import("@/lib/wa-gateway.server");
    await _rec(data.logId);
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
export const listMyWaHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { username?: string; featureId?: string; limit?: number }) =>
    z.object({
      username: z.string().max(80).optional(),
      featureId: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { reconcileUnmatchedWaReplies: _rec } = await import("@/lib/wa-gateway.server");
    await _rec(undefined, data.featureId);
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

// ============= PENDING LOCK (global per user) =============
export const getWaPending = createServerFn({ method: "POST" })
  .inputValidator((input: { username?: string }) =>
    z.object({ username: z.string().max(80).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { reconcileUnmatchedWaReplies: _rec } = await import("@/lib/wa-gateway.server");
    await _rec();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let q = supabaseAdmin
      .from("wa_send_log")
      .select("id, feature_id, query, command_sent, created_at")
      .eq("status", "sent")
      .is("reply", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data.username) q = q.eq("username", data.username);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] as any;
    if (!row) return { pending: false as const };
    return {
      pending: true as const,
      logId: row.id as string,
      featureId: row.feature_id as string,
      query: row.query as string,
      command: row.command_sent as string,
      created_at: row.created_at as string,
    };
  });

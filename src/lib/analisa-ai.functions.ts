import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  parseCpReply,
  parseDataPhoneReply,
  parseConvertBtsReply,
  parseClosestBtsReply,
  tabulateKeyValue,
  type CpParsed,
  type DataPhoneParsed,
  type BtsPointParsed,
  type ClosestBtsParsed,
} from "./analisa-ai-parse";

// ─────────────────────────────────────────────────────────────
// Konstanta orkestrasi
// ─────────────────────────────────────────────────────────────

const STEP_INTERVAL_MS = 5 * 60 * 1000; // 5 menit antar-command
const REPLY_TIMEOUT_MS = 5 * 60 * 1000; // step dianggap timeout setelah 5 menit

export type StepKey =
  | "cp"
  | "data_phone"
  | "convertBTS"
  | "closestBTS"
  | "data_nik"
  | "nikdetail"
  | "kk"
  | "nkes"
  | "prof";

export type StepDef = {
  key: StepKey;
  label: string;
  command: string;
};

export const STEP_DEFS: StepDef[] = [
  { key: "cp",         label: "Lokasi Awal",        command: "/cp" },
  { key: "data_phone", label: "Data Pemilik Nomor", command: "/data" },
  { key: "convertBTS", label: "Convert BTS",        command: "/convertBTS" },
  { key: "closestBTS", label: "Closest BTS",        command: "/closestBTS" },
  { key: "data_nik",   label: "Data via NIK",       command: "/data" },
  { key: "nikdetail",  label: "Detail NIK",         command: "/nikdetail" },
  { key: "kk",         label: "Kartu Keluarga",     command: "/kk" },
  { key: "nkes",       label: "BPJS Kesehatan",     command: "/nkes" },
  { key: "prof",       label: "Profile",            command: "/prof" },
];

// ─────────────────────────────────────────────────────────────
// Types (return shape)
// ─────────────────────────────────────────────────────────────

export type StepRow = {
  id: string;
  step_index: number;
  key: StepKey;
  command: string;
  query: string;
  status: "pending" | "sent" | "done" | "timeout" | "error" | "skipped";
  reply: string | null;
  parsed: Record<string, any> | Array<any> | null;
  sent_at: string | null;
  reply_at: string | null;
  wa_log_id: string | null;
  created_at: string;
};

export type RunRow = {
  id: string;
  username: string | null;
  target_phone: string;
  status: string;
  current_step: number;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
  steps: StepRow[];
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sanitizePhone(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

async function sendCommandToWa(command: string, query: string): Promise<{
  ok: boolean;
  message: string;
  logId?: string;
  provider?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("wa_gateway_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!row) return { ok: false, message: "Setting WA gateway belum tersedia." };
  const anyRow = row as any;
  if (!anyRow.enabled) return { ok: false, message: "Integrasi WhatsApp belum diaktifkan admin." };
  const target = sanitizePhone(anyRow.bot_number);
  if (!target) return { ok: false, message: "Nomor bot belum dikonfigurasi." };
  if (!anyRow.api_token) return { ok: false, message: "Token API gateway belum diisi." };

  const message = `${command.trim()} ${query.trim()}`.trim();
  const provider = (anyRow.provider as string) ?? "fonnte";

  let result: { ok: boolean; status: number; text: string };
  try {
    if (provider === "wablas") {
      let sub = String(anyRow.subdomain ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      let realToken: string = String(anyRow.api_token);
      if (!sub && realToken.includes("|")) {
        const [s, t] = realToken.split("|");
        if (s) sub = s.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (t) realToken = t.trim();
      }
      if (!sub) sub = "solo";
      const secret = String(anyRow.secret_key ?? "");
      const auth = secret.length > 0 ? `${realToken}.${secret}` : realToken;
      const res = await fetch(`https://${sub}.wablas.com/api/send-message`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ phone: target, message }).toString(),
      });
      result = { ok: res.ok, status: res.status, text: await res.text() };
    } else {
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: String(anyRow.api_token), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ target, message, countryCode: "62" }).toString(),
      });
      result = { ok: res.ok, status: res.status, text: await res.text() };
    }
  } catch (e) {
    return { ok: false, message: `Gagal menghubungi gateway: ${(e as Error).message}` };
  }

  const success = result.ok && !/error|invalid|failed/i.test(result.text.slice(0, 200));
  const { data: inserted } = await supabaseAdmin
    .from("wa_send_log")
    .insert({
      username: null,
      feature_id: `analisa_${command.replace(/[^a-z]/gi, "").toLowerCase()}`,
      query,
      command_sent: message,
      status: success ? "sent" : "failed",
      provider,
      provider_response: result.text.slice(0, 2000),
      error: success ? null : `HTTP ${result.status}`,
    })
    .select("id")
    .single();

  return {
    ok: success,
    message: success ? `"${message}" terkirim.` : `Gateway menolak (HTTP ${result.status}).`,
    logId: (inserted as any)?.id,
    provider,
  };
}

async function loadRun(runId: string): Promise<RunRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: run } = await supabaseAdmin
    .from("analisa_ai_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;
  const { data: steps } = await supabaseAdmin
    .from("analisa_ai_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  return { ...(run as any), steps: (steps ?? []) as StepRow[] };
}

/** Sync balasan bot: cari wa_send_log.reply untuk setiap step yang masih menunggu. */
async function syncStepReplies(runId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: steps } = await supabaseAdmin
    .from("analisa_ai_steps")
    .select("*")
    .eq("run_id", runId)
    .eq("status", "sent");
  const list = (steps ?? []) as StepRow[];
  for (const s of list) {
    if (!s.wa_log_id) continue;
    const { data: log } = await supabaseAdmin
      .from("wa_send_log")
      .select("reply, reply_at")
      .eq("id", s.wa_log_id)
      .maybeSingle();
    const reply = (log as any)?.reply as string | null | undefined;
    if (reply) {
      const parsed = parseByKey(s.key as StepKey, reply);
      await supabaseAdmin
        .from("analisa_ai_steps")
        .update({
          reply,
          reply_at: (log as any).reply_at ?? new Date().toISOString(),
          parsed: parsed as any,
          status: "done",
        })
        .eq("id", s.id);
    } else if (s.sent_at) {
      const age = Date.now() - new Date(s.sent_at).getTime();
      if (age > REPLY_TIMEOUT_MS) {
        await supabaseAdmin
          .from("analisa_ai_steps")
          .update({ status: "timeout" })
          .eq("id", s.id);
      }
    }
  }
}

function parseByKey(key: StepKey, text: string): Record<string, any> | Array<any> {
  switch (key) {
    case "cp":         return parseCpReply(text) as Record<string, any>;
    case "data_phone": return parseDataPhoneReply(text) as Record<string, any>;
    case "convertBTS": return parseConvertBtsReply(text) as Record<string, any>;
    case "closestBTS": return parseClosestBtsReply(text) as Record<string, any>;
    default:           return tabulateKeyValue(text);
  }
}

/** Cari query untuk step berikutnya berdasarkan step sebelumnya. */
function resolveQueryForKey(key: StepKey, targetPhone: string, steps: StepRow[]): string | null {
  const byKey = (k: StepKey): StepRow | undefined => steps.find((s) => s.key === k);
  const cp = byKey("cp")?.parsed as CpParsed | undefined;
  const dp = byKey("data_phone")?.parsed as DataPhoneParsed | undefined;
  switch (key) {
    case "cp":
    case "data_phone":
    case "prof":
      return targetPhone;
    case "convertBTS":
      return cp?.bts_id ?? null;
    case "closestBTS":
      return cp?.lat != null && cp?.long != null ? `${cp.lat},${cp.long}` : null;
    case "data_nik":
    case "nikdetail":
    case "nkes":
      return dp?.nik ?? null;
    case "kk":
      return dp?.kk ?? null;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Server functions
// ─────────────────────────────────────────────────────────────

export const startAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; username?: string }) =>
    z.object({
      phone: z.string().min(6).max(20),
      username: z.string().max(80).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = sanitizePhone(data.phone);
    if (phone.length < 8) return { ok: false as const, message: "Nomor HP tidak valid." };

    const { data: run, error } = await supabaseAdmin
      .from("analisa_ai_runs")
      .insert({ target_phone: phone, username: data.username ?? null })
      .select("*")
      .single();
    if (error || !run) return { ok: false as const, message: error?.message ?? "Gagal membuat run." };

    // Langsung kirim step pertama (/cp <phone>)
    const first = STEP_DEFS[0];
    const send = await sendCommandToWa(first.command, phone);
    await supabaseAdmin.from("analisa_ai_steps").insert({
      run_id: (run as any).id,
      step_index: 0,
      key: first.key,
      command: first.command,
      query: phone,
      wa_log_id: send.logId ?? null,
      status: send.ok ? "sent" : "error",
      sent_at: send.ok ? new Date().toISOString() : null,
    });
    await supabaseAdmin
      .from("analisa_ai_runs")
      .update({ current_step: 0, updated_at: new Date().toISOString() })
      .eq("id", (run as any).id);

    return { ok: true as const, runId: (run as any).id };
  });

export const getAnalysisRun = createServerFn({ method: "POST" })
  .inputValidator((input: { runId: string }) =>
    z.object({ runId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await syncStepReplies(data.runId);
    const run = await loadRun(data.runId);
    if (!run) return { ok: false as const, message: "Run tidak ditemukan." };
    return { ok: true as const, run };
  });

/** Internal advance logic — dipakai server-fn dan cron tick. */
export async function _advanceRunOnce(runId: string): Promise<{
  ok: true; run: RunRow; advanced: boolean; done?: boolean; skipped?: boolean; waitMs?: number;
} | { ok: false; message: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await syncStepReplies(runId);
  const run = await loadRun(runId);
  if (!run) return { ok: false, message: "Run tidak ditemukan." };
  if (run.status !== "running") return { ok: true, run, advanced: false };

  const lastStep = run.steps[run.steps.length - 1];
  if (lastStep && lastStep.status === "sent" && lastStep.sent_at) {
    const age = Date.now() - new Date(lastStep.sent_at).getTime();
    if (age < REPLY_TIMEOUT_MS) return { ok: true, run, advanced: false, waitMs: REPLY_TIMEOUT_MS - age };
  }
  if (lastStep?.sent_at) {
    const gap = Date.now() - new Date(lastStep.sent_at).getTime();
    if (gap < STEP_INTERVAL_MS) return { ok: true, run, advanced: false, waitMs: STEP_INTERVAL_MS - gap };
  }

  const nextIndex = run.steps.length;
  if (nextIndex >= STEP_DEFS.length) {
    await supabaseAdmin
      .from("analisa_ai_runs")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", run.id);
    const refreshed = await loadRun(run.id);
    return { ok: true, run: refreshed!, advanced: false, done: true };
  }

  const def = STEP_DEFS[nextIndex];
  const q = resolveQueryForKey(def.key, run.target_phone, run.steps);

  if (!q) {
    await supabaseAdmin.from("analisa_ai_steps").insert({
      run_id: run.id, step_index: nextIndex, key: def.key, command: def.command, query: "", status: "skipped",
    });
    await supabaseAdmin
      .from("analisa_ai_runs")
      .update({ current_step: nextIndex, updated_at: new Date().toISOString() })
      .eq("id", run.id);
    const refreshed = await loadRun(run.id);
    return { ok: true, run: refreshed!, advanced: true, skipped: true };
  }

  const send = await sendCommandToWa(def.command, q);
  await supabaseAdmin.from("analisa_ai_steps").insert({
    run_id: run.id, step_index: nextIndex, key: def.key, command: def.command, query: q,
    wa_log_id: send.logId ?? null,
    status: send.ok ? "sent" : "error",
    sent_at: send.ok ? new Date().toISOString() : null,
    reply: send.ok ? null : send.message,
  });
  await supabaseAdmin
    .from("analisa_ai_runs")
    .update({ current_step: nextIndex, updated_at: new Date().toISOString() })
    .eq("id", run.id);
  const refreshed = await loadRun(run.id);
  return { ok: true, run: refreshed!, advanced: true };
}

export const advanceAnalysisStep = createServerFn({ method: "POST" })
  .inputValidator((input: { runId: string }) =>
    z.object({ runId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => _advanceRunOnce(data.runId));



export const abortAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: { runId: string }) =>
    z.object({ runId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("analisa_ai_runs")
      .update({ status: "aborted", updated_at: new Date().toISOString() })
      .eq("id", data.runId);
    return { ok: true as const };
  });

export const listAnalysisRuns = createServerFn({ method: "POST" })
  .inputValidator((input: { username?: string; limit?: number } | undefined) =>
    z.object({ username: z.string().max(80).optional(), limit: z.number().int().min(1).max(50).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("analisa_ai_runs").select("*").order("created_at", { ascending: false }).limit(data.limit ?? 20);
    if (data.username) q = q.eq("username", data.username);
    const { data: rows, error } = await q;
    if (error) return { ok: false as const, message: error.message, runs: [] };
    return { ok: true as const, runs: (rows ?? []) as RunRow[] };
  });

export const generateAiSummary = createServerFn({ method: "POST" })
  .inputValidator((input: { runId: string }) =>
    z.object({ runId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, message: "LOVABLE_API_KEY belum dikonfigurasi." };

    const run = await loadRun(data.runId);
    if (!run) return { ok: false as const, message: "Run tidak ditemukan." };

    const context = run.steps
      .map((s) => {
        const head = `▸ ${s.command} ${s.query} — status: ${s.status}`;
        const reply = s.reply ? `\nBALASAN:\n${s.reply}` : "";
        return `${head}${reply}`;
      })
      .join("\n\n");

    const prompt = `Kamu adalah analis intelijen OSINT. Berdasarkan data mentah balasan bot berikut untuk nomor target ${run.target_phone}, buat ANALISA singkat, terstruktur, dan objektif dalam Bahasa Indonesia (maks 8 paragraf). Sertakan:
1. Identitas & profil pemilik nomor
2. Lokasi terkini + interpretasi (kota/wilayah)
3. Jaringan BTS terdekat & indikasi mobilitas
4. Data keluarga (dari KK)
5. Status BPJS / kesehatan
6. Penilaian anomali atau risiko
7. Kesimpulan singkat

Data:
${context}`;

    let text = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Kamu adalah analis intelijen OSINT profesional." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false as const, message: `AI Gateway error (HTTP ${res.status}): ${body.slice(0, 300)}` };
      }
      const json: any = await res.json();
      text = json?.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      return { ok: false as const, message: `Gagal memanggil AI: ${(e as Error).message}` };
    }

    if (!text.trim()) return { ok: false as const, message: "AI tidak mengembalikan hasil." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("analisa_ai_runs")
      .update({ ai_summary: text, updated_at: new Date().toISOString() })
      .eq("id", run.id);
    return { ok: true as const, summary: text };
  });

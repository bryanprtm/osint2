import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ModuleRow = {
  id: string;
  code: string;
  name: string;
  desc: string;
  input: string;
  placeholder: string;
  category: string;
  iconKey: string;
  enabled: boolean;
  custom: boolean;
  sort_order: number;
};

export type AppSettingsRow = {
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
};

const moduleInputSchema = z.object({
  id: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  desc: z.string().max(500).default(""),
  input: z.string().max(120).default(""),
  placeholder: z.string().max(200).default(""),
  category: z.string().trim().min(1).max(60),
  iconKey: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(true),
  custom: z.boolean().default(true),
  sort_order: z.number().int().optional(),
});

type DbRow = {
  id: string; code: string; name: string; description: string; input_label: string;
  placeholder: string; category: string; icon_key: string; enabled: boolean;
  custom: boolean; sort_order: number;
};

const fromDb = (r: DbRow): ModuleRow => ({
  id: r.id, code: r.code, name: r.name, desc: r.description, input: r.input_label,
  placeholder: r.placeholder, category: r.category, iconKey: r.icon_key,
  enabled: r.enabled, custom: r.custom, sort_order: r.sort_order,
});

// ============ LIST ============
export const listModules = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_modules")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { modules: ((data ?? []) as DbRow[]).map(fromDb) };
});

// ============ UPSERT (add or full update) ============
export const upsertModule = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof moduleInputSchema>) => moduleInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      id: data.id, code: data.code, name: data.name, description: data.desc,
      input_label: data.input, placeholder: data.placeholder, category: data.category,
      icon_key: data.iconKey, enabled: data.enabled, custom: data.custom,
      sort_order: data.sort_order ?? 0,
    };
    const { error } = await supabaseAdmin.from("app_modules").upsert(row, { onConflict: "id" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ============ PATCH ============
export const patchModule = createServerFn({ method: "POST" })
  .inputValidator((input: {
    id: string; enabled?: boolean; name?: string; desc?: string; input?: string;
    placeholder?: string; category?: string; iconKey?: string; code?: string;
  }) =>
    z.object({
      id: z.string().min(1),
      enabled: z.boolean().optional(),
      name: z.string().min(1).max(120).optional(),
      desc: z.string().max(500).optional(),
      input: z.string().max(120).optional(),
      placeholder: z.string().max(200).optional(),
      category: z.string().min(1).max(60).optional(),
      iconKey: z.string().min(1).max(60).optional(),
      code: z.string().min(1).max(40).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      enabled?: boolean; name?: string; description?: string; input_label?: string;
      placeholder?: string; category?: string; icon_key?: string; code?: string;
    } = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.name !== undefined) patch.name = data.name;
    if (data.desc !== undefined) patch.description = data.desc;
    if (data.input !== undefined) patch.input_label = data.input;
    if (data.placeholder !== undefined) patch.placeholder = data.placeholder;
    if (data.category !== undefined) patch.category = data.category;
    if (data.iconKey !== undefined) patch.icon_key = data.iconKey;
    if (data.code !== undefined) patch.code = data.code;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabaseAdmin.from("app_modules").update(patch).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ============ DELETE ============
export const deleteModule = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_modules").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ============ RESET (replace all with provided defaults) ============
export const resetModulesAll = createServerFn({ method: "POST" })
  .inputValidator((input: { modules: z.input<typeof moduleInputSchema>[] }) =>
    z.object({ modules: z.array(moduleInputSchema).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin.from("app_modules").delete().neq("id", "");
    if (delErr) return { ok: false as const, error: delErr.message };
    const rows = data.modules.map((m, i) => ({
      id: m.id, code: m.code, name: m.name, description: m.desc,
      input_label: m.input, placeholder: m.placeholder, category: m.category,
      icon_key: m.iconKey, enabled: m.enabled, custom: m.custom,
      sort_order: m.sort_order ?? i,
    }));
    const { error } = await supabaseAdmin.from("app_modules").insert(rows);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ============ SETTINGS ============
export const getAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data ?? { telegram_bot_token: "", telegram_chat_id: "", telegram_enabled: false };
  return {
    settings: {
      telegramBotToken: row.telegram_bot_token ?? "",
      telegramChatId: row.telegram_chat_id ?? "",
      telegramEnabled: row.telegram_enabled ?? false,
    } satisfies AppSettingsRow,
  };
});

export const updateAppSettings = createServerFn({ method: "POST" })
  .inputValidator((input: Partial<AppSettingsRow>) =>
    z.object({
      telegramBotToken: z.string().max(500).optional(),
      telegramChatId: z.string().max(200).optional(),
      telegramEnabled: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      telegram_bot_token?: string; telegram_chat_id?: string;
      telegram_enabled?: boolean; updated_at?: string;
    } = { updated_at: new Date().toISOString() };
    if (data.telegramBotToken !== undefined) patch.telegram_bot_token = data.telegramBotToken;
    if (data.telegramChatId !== undefined) patch.telegram_chat_id = data.telegramChatId;
    if (data.telegramEnabled !== undefined) patch.telegram_enabled = data.telegramEnabled;
    const { error } = await supabaseAdmin.from("app_settings").update(patch).eq("id", 1);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

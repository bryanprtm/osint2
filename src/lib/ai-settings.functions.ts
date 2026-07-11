import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AiProvider = "lovable" | "openai";

export type AiSettingsPublic = {
  provider: AiProvider;
  openai_model: string;
  openai_base_url: string;
  lovable_model: string;
  has_openai_key: boolean;
  updated_at: string;
};

export type AiSettingsInternal = {
  provider: AiProvider;
  openai_api_key: string | null;
  openai_model: string;
  openai_base_url: string;
  lovable_model: string;
};

async function loadRow() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) {
    await supabaseAdmin.from("ai_settings").insert({ id: 1 });
    const { data: d2 } = await supabaseAdmin.from("ai_settings").select("*").eq("id", 1).single();
    return d2 as any;
  }
  return data as any;
}

function toPublic(row: any): AiSettingsPublic {
  return {
    provider: (row.provider as AiProvider) ?? "lovable",
    openai_model: row.openai_model ?? "gpt-4o-mini",
    openai_base_url: row.openai_base_url ?? "https://api.openai.com/v1",
    lovable_model: row.lovable_model ?? "google/gemini-2.5-flash",
    has_openai_key: !!(row.openai_api_key && String(row.openai_api_key).length > 0),
    updated_at: row.updated_at,
  };
}

export async function loadAiSettingsInternal(): Promise<AiSettingsInternal> {
  const row = await loadRow();
  return {
    provider: (row.provider as AiProvider) ?? "lovable",
    openai_api_key: row.openai_api_key ?? null,
    openai_model: row.openai_model ?? "gpt-4o-mini",
    openai_base_url: row.openai_base_url ?? "https://api.openai.com/v1",
    lovable_model: row.lovable_model ?? "google/gemini-2.5-flash",
  };
}

export const getAiSettings = createServerFn({ method: "GET" }).handler(async () => {
  const row = await loadRow();
  return { settings: toPublic(row) };
});

export const saveAiSettings = createServerFn({ method: "POST" })
  .inputValidator((input: {
    provider: AiProvider;
    openai_model?: string;
    openai_base_url?: string;
    lovable_model?: string;
    openai_api_key?: string; // empty string keeps existing; use clear_openai_key to remove
    clear_openai_key?: boolean;
  }) =>
    z.object({
      provider: z.enum(["lovable", "openai"]),
      openai_model: z.string().max(120).optional(),
      openai_base_url: z.string().max(200).optional(),
      lovable_model: z.string().max(120).optional(),
      openai_api_key: z.string().max(500).optional(),
      clear_openai_key: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      provider: AiProvider;
      updated_at: string;
      openai_model?: string;
      openai_base_url?: string;
      lovable_model?: string;
      openai_api_key?: string | null;
    } = {
      provider: data.provider,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.openai_model === "string" && data.openai_model.trim()) {
      patch.openai_model = data.openai_model.trim();
    }
    if (typeof data.openai_base_url === "string" && data.openai_base_url.trim()) {
      patch.openai_base_url = data.openai_base_url.trim().replace(/\/+$/, "");
    }
    if (typeof data.lovable_model === "string" && data.lovable_model.trim()) {
      patch.lovable_model = data.lovable_model.trim();
    }
    if (data.clear_openai_key) {
      patch.openai_api_key = null;
    } else if (typeof data.openai_api_key === "string" && data.openai_api_key.trim().length > 0) {
      patch.openai_api_key = data.openai_api_key.trim();
    }
    const { error } = await supabaseAdmin.from("ai_settings").update(patch).eq("id", 1);
    if (error) return { ok: false as const, error: error.message };
    const row = await loadRow();
    return { ok: true as const, settings: toPublic(row) };
  });

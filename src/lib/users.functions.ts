import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";

export type AppUserRow = {
  id: string;
  username: string;
  role: "admin" | "operator";
  label: string;
  created_at: string;
  updated_at: string;
};

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username minimal 2 karakter")
  .max(40, "Username maksimal 40 karakter")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Hanya huruf, angka, titik, garis bawah, atau strip");

const passwordSchema = z.string().min(3, "Password minimal 3 karakter").max(128);
const labelSchema = z.string().trim().min(1).max(60);
const roleSchema = z.enum(["admin", "operator"]);

const BCRYPT_ROUNDS = 10;
const isBcryptHash = (s: string) => /^\$2[aby]\$/.test(s);

export type LoginLogRow = {
  id: string;
  user_id: string | null;
  username: string;
  action: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
};

function newToken() {
  // 32 bytes hex
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// =============== LOGIN ===============
export const loginCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string; userAgent?: string }) =>
    z
      .object({
        username: z.string().min(1).max(100),
        password: z.string().min(1).max(200),
        userAgent: z.string().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.trim().toLowerCase();
    const { data: row, error } = await supabaseAdmin
      .from("app_users")
      .select("id, username, password, role, label")
      .eq("username", username)
      .maybeSingle();

    if (error) return { ok: false as const, error: "Gagal terhubung ke server" };
    if (!row) {
      await supabaseAdmin.from("app_login_log").insert({
        user_id: null, username, action: "failed",
        user_agent: data.userAgent ?? null, detail: "user not found",
      });
      return { ok: false as const, error: "Username atau password salah." };
    }

    const stored = row.password as string;
    let valid = false;
    if (isBcryptHash(stored)) {
      valid = await bcrypt.compare(data.password, stored);
    } else {
      valid = stored === data.password;
      if (valid) {
        const hashed = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        await supabaseAdmin.from("app_users").update({ password: hashed }).eq("id", row.id);
      }
    }
    if (!valid) {
      await supabaseAdmin.from("app_login_log").insert({
        user_id: row.id, username, action: "failed",
        user_agent: data.userAgent ?? null, detail: "bad password",
      });
      return { ok: false as const, error: "Username atau password salah." };
    }

    // Single-device: rotate session token, kicking any previous device.
    const token = newToken();
    await supabaseAdmin
      .from("app_users")
      .update({ current_session_token: token, last_login_at: new Date().toISOString() })
      .eq("id", row.id);

    await supabaseAdmin.from("app_login_log").insert({
      user_id: row.id, username, action: "login",
      user_agent: data.userAgent ?? null,
    });

    return {
      ok: true as const,
      token,
      user: {
        id: row.id as string,
        username: row.username as string,
        role: row.role as "admin" | "operator",
        label: row.label as string,
      },
    };
  });

// =============== VALIDATE SESSION ===============
export const validateSession = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; token: string }) =>
    z.object({ userId: z.string().uuid(), token: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_users")
      .select("current_session_token")
      .eq("id", data.userId)
      .maybeSingle();
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.current_session_token !== data.token) return { ok: false as const, reason: "kicked" as const };
    return { ok: true as const };
  });

// =============== LOGOUT ===============
export const logoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { userId: string; token: string; reason?: "manual" | "idle_timeout" }) =>
      z
        .object({
          userId: z.string().uuid(),
          token: z.string().min(8).max(128),
          reason: z.enum(["manual", "idle_timeout"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_users")
      .select("id, username, current_session_token")
      .eq("id", data.userId)
      .maybeSingle();
    if (!row) return { ok: true as const };
    // Only clear the token if it still matches this device
    if (row.current_session_token === data.token) {
      await supabaseAdmin.from("app_users").update({ current_session_token: null }).eq("id", row.id);
    }
    await supabaseAdmin.from("app_login_log").insert({
      user_id: row.id,
      username: row.username as string,
      action: data.reason === "idle_timeout" ? "idle_timeout" : "logout",
    });
    return { ok: true as const };
  });

// =============== LOGIN LOG (admin) ===============
export const listLoginLog = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_login_log")
    .select("id, user_id, username, action, ip, user_agent, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as LoginLogRow[] };
});

// =============== LIST ===============
export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, username, role, label, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { users: (data ?? []) as AppUserRow[] };
});

// =============== CREATE ===============
export const createUser = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string; role: "admin" | "operator"; label: string }) =>
    z
      .object({
        username: usernameSchema,
        password: passwordSchema,
        role: roleSchema,
        label: labelSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) return { ok: false as const, error: "Username sudah dipakai." };

    const hashed = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const { data: row, error } = await supabaseAdmin
      .from("app_users")
      .insert({ username, password: hashed, role: data.role, label: data.label })
      .select("id, username, role, label, created_at, updated_at")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, user: row as AppUserRow };
  });

// =============== UPDATE ===============
export const updateUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      id: string;
      password?: string;
      role?: "admin" | "operator";
      label?: string;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          password: passwordSchema.optional(),
          role: roleSchema.optional(),
          label: labelSchema.optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { password?: string; role?: "admin" | "operator"; label?: string } = {};
    if (data.password !== undefined) patch.password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    if (data.role !== undefined) patch.role = data.role;
    if (data.label !== undefined) patch.label = data.label;
    if (Object.keys(patch).length === 0) return { ok: false as const, error: "Tidak ada perubahan." };

    const { data: row, error } = await supabaseAdmin
      .from("app_users")
      .update(patch)
      .eq("id", data.id)
      .select("id, username, role, label, created_at, updated_at")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, user: row as AppUserRow };
  });

// =============== DELETE ===============
export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Safety: prevent deleting the last admin
    const { count: adminCount } = await supabaseAdmin
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    const { data: target } = await supabaseAdmin
      .from("app_users")
      .select("role")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) return { ok: false as const, error: "User tidak ditemukan." };
    if (target.role === "admin" && (adminCount ?? 0) <= 1) {
      return { ok: false as const, error: "Tidak bisa menghapus admin terakhir." };
    }

    const { error } = await supabaseAdmin.from("app_users").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

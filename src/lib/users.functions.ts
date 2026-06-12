import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

// =============== LOGIN ===============
export const loginCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) =>
    z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(input),
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
    if (!row) return { ok: false as const, error: "Username atau password salah." };
    if (row.password !== data.password) return { ok: false as const, error: "Username atau password salah." };

    return {
      ok: true as const,
      user: {
        id: row.id as string,
        username: row.username as string,
        role: row.role as "admin" | "operator",
        label: row.label as string,
      },
    };
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

    const { data: row, error } = await supabaseAdmin
      .from("app_users")
      .insert({ username, password: data.password, role: data.role, label: data.label })
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
    const patch: Record<string, unknown> = {};
    if (data.password !== undefined) patch.password = data.password;
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

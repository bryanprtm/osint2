import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron tick untuk orkestrasi Analisa AI Target.
 * Dipanggil pg_cron setiap 1 menit. Advance semua run yang berstatus 'running'.
 * Membuat proses lepas dari state UI — halaman boleh ditutup / user boleh back.
 */
export const Route = createFileRoute("/api/public/hooks/analisa-tick")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { _advanceRunOnce } = await import("@/lib/analisa-ai.functions");

          const { data: runs, error } = await supabaseAdmin
            .from("analisa_ai_runs")
            .select("id")
            .eq("status", "running")
            .order("created_at", { ascending: true })
            .limit(50);
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }

          const results = [] as Array<{ id: string; advanced?: boolean; done?: boolean; ok: boolean; message?: string }>;
          for (const r of runs ?? []) {
            try {
              const res = await _advanceRunOnce((r as any).id);
              if (res.ok) results.push({ id: (r as any).id, ok: true, advanced: (res as any).advanced, done: (res as any).done });
              else results.push({ id: (r as any).id, ok: false, message: (res as any).message });
            } catch (e) {
              results.push({ id: (r as any).id, ok: false, message: (e as Error).message });
            }
          }
          return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

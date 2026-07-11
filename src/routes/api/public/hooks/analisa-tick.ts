import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron tick untuk orkestrasi Analisa AI Target.
 * Dipanggil pg_cron setiap 1 menit. Untuk setiap run yang statusnya 'running',
 * lakukan sinkronisasi balasan bot lalu (jika interval 5 menit sudah tercapai)
 * lanjutkan ke command berikutnya. Menjadikan proses bebas dari state UI —
 * halaman boleh ditutup / user boleh back tanpa menghentikan analisa.
 */
export const Route = createFileRoute("/api/public/hooks/analisa-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { advanceAnalysisStep } = await import("@/lib/analisa-ai.functions");

          const { data: runs, error } = await supabaseAdmin
            .from("analisa_ai_runs")
            .select("id, created_at")
            .eq("status", "running")
            .order("created_at", { ascending: true })
            .limit(50);
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }

          const results: Array<{ id: string; ok: boolean; advanced?: boolean; done?: boolean; message?: string }> = [];
          for (const r of runs ?? []) {
            try {
              const res: any = await (advanceAnalysisStep as any).handler({ data: { runId: (r as any).id } });
              // Some builds expose the inner handler directly; fallback: call as fn
              results.push({ id: (r as any).id, ok: true, advanced: res?.advanced, done: res?.done });
            } catch (e) {
              try {
                // Fallback: invoke as server-fn (RPC self-call)
                const res: any = await (advanceAnalysisStep as any)({ data: { runId: (r as any).id } });
                results.push({ id: (r as any).id, ok: true, advanced: res?.advanced, done: res?.done });
              } catch (e2) {
                results.push({ id: (r as any).id, ok: false, message: (e2 as Error).message });
              }
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
      GET: async () => new Response("ok"),
    },
  },
});

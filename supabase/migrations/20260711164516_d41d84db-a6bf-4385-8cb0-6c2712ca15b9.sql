
CREATE TABLE public.analisa_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text,
  target_phone text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  current_step int NOT NULL DEFAULT 0,
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analisa_ai_runs TO authenticated;
GRANT SELECT ON public.analisa_ai_runs TO anon;
GRANT ALL ON public.analisa_ai_runs TO service_role;
ALTER TABLE public.analisa_ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analisa_ai_runs no direct access" ON public.analisa_ai_runs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.analisa_ai_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.analisa_ai_runs(id) ON DELETE CASCADE,
  step_index int NOT NULL,
  key text NOT NULL,
  command text NOT NULL,
  query text NOT NULL,
  wa_log_id uuid,
  status text NOT NULL DEFAULT 'pending',
  reply text,
  parsed jsonb,
  sent_at timestamptz,
  reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analisa_ai_steps TO authenticated;
GRANT SELECT ON public.analisa_ai_steps TO anon;
GRANT ALL ON public.analisa_ai_steps TO service_role;
ALTER TABLE public.analisa_ai_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analisa_ai_steps no direct access" ON public.analisa_ai_steps FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX ON public.analisa_ai_steps (run_id, step_index);

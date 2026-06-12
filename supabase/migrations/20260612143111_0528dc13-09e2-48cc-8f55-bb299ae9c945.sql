
CREATE TABLE public.wa_settings (
  id int PRIMARY KEY DEFAULT 1,
  wablas_endpoint text NOT NULL DEFAULT 'https://solo.wablas.com',
  bot_number_nik text NOT NULL DEFAULT '',
  bot_number_kk text NOT NULL DEFAULT '',
  command_nik text NOT NULL DEFAULT '/nik {query}',
  command_kk text NOT NULL DEFAULT '/kk {query}',
  enabled boolean NOT NULL DEFAULT false,
  response_timeout_sec int NOT NULL DEFAULT 45,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_settings_singleton CHECK (id = 1)
);
INSERT INTO public.wa_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.wa_settings TO anon, authenticated;
GRANT ALL ON public.wa_settings TO service_role;
ALTER TABLE public.wa_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_settings readable by all" ON public.wa_settings FOR SELECT USING (true);
CREATE POLICY "wa_settings writable by all" ON public.wa_settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.wa_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL,
  query text NOT NULL,
  target_number text NOT NULL,
  command_sent text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_text text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX wa_lookups_target_pending_idx
  ON public.wa_lookups (target_number, status, created_at DESC);
CREATE INDEX wa_lookups_created_idx ON public.wa_lookups (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.wa_lookups TO anon, authenticated;
GRANT ALL ON public.wa_lookups TO service_role;
ALTER TABLE public.wa_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_lookups readable by all" ON public.wa_lookups FOR SELECT USING (true);
CREATE POLICY "wa_lookups insertable by all" ON public.wa_lookups FOR INSERT WITH CHECK (true);
CREATE POLICY "wa_lookups updatable by all" ON public.wa_lookups FOR UPDATE USING (true) WITH CHECK (true);

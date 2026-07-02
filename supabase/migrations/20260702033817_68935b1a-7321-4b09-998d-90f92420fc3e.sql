
DROP TABLE IF EXISTS public.wa_lookups CASCADE;
DROP TABLE IF EXISTS public.wa_settings CASCADE;

CREATE TABLE public.wa_gateway_settings (
  id integer PRIMARY KEY DEFAULT 1,
  provider text NOT NULL DEFAULT 'fonnte',
  bot_number text NOT NULL DEFAULT '',
  api_token text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  commands jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_gateway_settings_single CHECK (id = 1)
);

GRANT ALL ON public.wa_gateway_settings TO service_role;
ALTER TABLE public.wa_gateway_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_gateway_settings no direct access" ON public.wa_gateway_settings
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

INSERT INTO public.wa_gateway_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.wa_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  username text,
  feature_id text NOT NULL,
  query text NOT NULL,
  command_sent text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT '',
  provider_response text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.wa_send_log TO service_role;
ALTER TABLE public.wa_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_send_log no direct access" ON public.wa_send_log
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE INDEX wa_send_log_created_idx ON public.wa_send_log (created_at DESC);

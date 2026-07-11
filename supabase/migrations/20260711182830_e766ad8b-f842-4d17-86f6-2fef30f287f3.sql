
CREATE TABLE public.ai_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  provider text NOT NULL DEFAULT 'lovable',
  openai_api_key text,
  openai_model text NOT NULL DEFAULT 'gpt-4o-mini',
  openai_base_url text NOT NULL DEFAULT 'https://api.openai.com/v1',
  lovable_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_settings_singleton CHECK (id = 1),
  CONSTRAINT ai_settings_provider_valid CHECK (provider IN ('lovable','openai'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Reads/writes go through server functions using service role; deny direct access.
CREATE POLICY "no_direct_access_ai_settings" ON public.ai_settings FOR ALL USING (false) WITH CHECK (false);

INSERT INTO public.ai_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

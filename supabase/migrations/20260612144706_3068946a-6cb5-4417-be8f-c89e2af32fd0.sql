
CREATE TABLE public.app_modules (
  id text PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  input_label text NOT NULL DEFAULT '',
  placeholder text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Lainnya',
  icon_key text NOT NULL DEFAULT 'Database',
  enabled boolean NOT NULL DEFAULT true,
  custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_modules TO service_role;
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_modules no direct access" ON public.app_modules FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER app_modules_set_updated_at BEFORE UPDATE ON public.app_modules
  FOR EACH ROW EXECUTE FUNCTION public.app_users_set_updated_at();

CREATE TABLE public.app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  telegram_bot_token text NOT NULL DEFAULT '',
  telegram_chat_id text NOT NULL DEFAULT '',
  telegram_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings no direct access" ON public.app_settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

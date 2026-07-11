
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS brand_title text NOT NULL DEFAULT 'Den 404 Anti Eror OSINT',
  ADD COLUMN IF NOT EXISTS brand_subtitle text NOT NULL DEFAULT 'PROFILER //ID',
  ADD COLUMN IF NOT EXISTS brand_logo_url text;

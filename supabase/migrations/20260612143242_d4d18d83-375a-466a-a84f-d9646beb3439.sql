
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator')),
  label text NOT NULL DEFAULT 'OPERATOR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tidak ada GRANT ke anon/authenticated — akses hanya lewat server function (service_role)
GRANT ALL ON public.app_users TO service_role;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
-- Tidak ada policy apa pun → klien tidak bisa membaca/menulis langsung.

CREATE OR REPLACE FUNCTION public.app_users_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.app_users_set_updated_at();

INSERT INTO public.app_users (username, password, role, label) VALUES
  ('admin', 'admin', 'admin', 'ADMINISTRATOR'),
  ('user',  'user123', 'operator', 'OPERATOR')
ON CONFLICT (username) DO NOTHING;

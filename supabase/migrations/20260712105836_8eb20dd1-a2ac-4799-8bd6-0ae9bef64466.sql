-- Session token + login log for single-device enforcement and audit
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS current_session_token text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS public.app_login_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  username text NOT NULL,
  action text NOT NULL, -- 'login' | 'logout' | 'kicked' | 'idle_timeout' | 'failed'
  ip text,
  user_agent text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.app_login_log TO authenticated;
GRANT ALL ON public.app_login_log TO service_role;

ALTER TABLE public.app_login_log ENABLE ROW LEVEL SECURITY;

-- No client access; only service_role via server functions
CREATE POLICY "app_login_log service only"
  ON public.app_login_log
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_app_login_log_created_at ON public.app_login_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_login_log_user ON public.app_login_log (user_id, created_at DESC);
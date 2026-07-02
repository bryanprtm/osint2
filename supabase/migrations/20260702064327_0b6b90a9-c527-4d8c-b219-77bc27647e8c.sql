ALTER TABLE public.wa_send_log
  ADD COLUMN IF NOT EXISTS reply TEXT,
  ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_sender TEXT;

CREATE INDEX IF NOT EXISTS wa_send_log_created_at_idx ON public.wa_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS wa_send_log_reply_idx ON public.wa_send_log (reply_at) WHERE reply IS NULL;

CREATE TABLE IF NOT EXISTS public.wa_incoming (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  raw JSONB,
  matched_log_id UUID REFERENCES public.wa_send_log(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.wa_incoming TO service_role;

ALTER TABLE public.wa_incoming ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_incoming no direct access"
  ON public.wa_incoming
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS wa_incoming_created_at_idx ON public.wa_incoming (created_at DESC);
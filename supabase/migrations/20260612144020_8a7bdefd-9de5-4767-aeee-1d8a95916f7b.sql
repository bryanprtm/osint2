
-- Lock down wa_settings: revoke public access, only service_role can read/write
DROP POLICY IF EXISTS "wa_settings readable by all" ON public.wa_settings;
DROP POLICY IF EXISTS "wa_settings writable by all" ON public.wa_settings;
REVOKE ALL ON public.wa_settings FROM anon, authenticated;

-- Lock down wa_lookups: revoke public access, only service_role
DROP POLICY IF EXISTS "wa_lookups readable by all" ON public.wa_lookups;
DROP POLICY IF EXISTS "wa_lookups insertable by all" ON public.wa_lookups;
DROP POLICY IF EXISTS "wa_lookups updatable by all" ON public.wa_lookups;
REVOKE ALL ON public.wa_lookups FROM anon, authenticated;

-- Ensure service_role retains full access (already implicit but explicit for clarity)
GRANT ALL ON public.wa_settings TO service_role;
GRANT ALL ON public.wa_lookups TO service_role;

-- Add explicit deny-by-default policy on app_users so the linter is satisfied;
-- all access goes through server functions using service_role which bypasses RLS.
CREATE POLICY "app_users no direct access" ON public.app_users FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

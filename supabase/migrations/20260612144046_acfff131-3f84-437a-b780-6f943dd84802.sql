
CREATE POLICY "wa_settings no direct access" ON public.wa_settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "wa_lookups no direct access" ON public.wa_lookups FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

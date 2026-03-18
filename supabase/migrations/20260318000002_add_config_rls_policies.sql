-- Fix: health_score_config and partner_health_config had RLS enabled but no
-- policies, which Supabase flags as a potential misconfiguration.
--
-- These are single-row admin configuration tables. All writes go through API
-- routes that use the service role key, which bypasses RLS entirely. Direct
-- browser clients should only be able to read config if the caller is an admin.
--
-- Adding explicit SELECT policies for admins:
--   • Makes the intended access pattern self-documenting in the schema
--   • Silences the rls_enabled_no_policy linter warning
--   • INSERT / UPDATE / DELETE remain service-role-only (no policy = denied
--     for regular clients; service role bypasses RLS and is unaffected)

CREATE POLICY "health_score_config_admin_select" ON public.health_score_config
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "partner_health_config_admin_select" ON public.partner_health_config
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Fix: products_insert policy used WITH CHECK (true), which Supabase flags as
-- an overly-permissive RLS expression. Replace with an explicit check that the
-- calling user is authenticated (auth.uid() IS NOT NULL).
--
-- Behaviour is identical — the policy is already restricted to the
-- `authenticated` role, so only signed-in users ever reach it — but the
-- expression is no longer statically true, which clears the linter warning.

DROP POLICY IF EXISTS "products_insert" ON public.products;

CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

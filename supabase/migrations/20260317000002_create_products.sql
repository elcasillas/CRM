-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text        NOT NULL,
  unit_price   numeric     NOT NULL DEFAULT 0,
  product_code text        NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read and insert
CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated WITH CHECK (true);

-- Admin only: update and delete
CREATE POLICY "products_update" ON public.products
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "products_delete" ON public.products
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Reuse existing set_updated_at trigger function
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

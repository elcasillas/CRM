-- Migration: Add product_category column to products table

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_category text NULL
    CHECK (
      product_category IS NULL OR
      product_category IN (
        'Website DIY', 'Website DIFM', 'Email ISP', 'Email Business',
        'Domain', 'Email Marketing', 'Fax Online', 'Logo DIFM',
        'Marketing Online', 'SSL', 'Support', 'Pro Serve', 'Other'
      )
    );

COMMENT ON COLUMN public.products.product_category IS
  'Optional product category. Allowed values: Website DIY, Website DIFM, Email ISP, Email Business, Domain, Email Marketing, Fax Online, Logo DIFM, Marketing Online, SSL, Support, Pro Serve, Other.';

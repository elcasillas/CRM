-- Allow 'other' as a valid contact role type
ALTER TABLE public.contact_roles
  DROP CONSTRAINT IF EXISTS contact_roles_role_type_check;

ALTER TABLE public.contact_roles
  ADD CONSTRAINT contact_roles_role_type_check
    CHECK (role_type IN ('primary', 'billing', 'marketing', 'support', 'technical', 'other'));

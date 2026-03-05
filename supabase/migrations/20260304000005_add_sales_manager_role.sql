-- Add 'sales_manager' role: same permissions as sales but can see all accounts and deals.

-- 1. Extend role check constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'sales', 'sales_manager', 'solutions_engineer', 'service_manager', 'read_only'));

-- 2. Update can_view_account so sales managers bypass the ownership filter
CREATE OR REPLACE FUNCTION public.can_view_account(uid uuid, acct_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    public.is_admin(uid)
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = uid AND role = 'sales_manager'
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = acct_id
        AND (a.account_owner_id = uid OR a.service_manager_id = uid)
    )
  );
$$;

-- 3. Allow sales managers to create deals (same as sales)
DROP POLICY IF EXISTS "deals: insert sales own or admin" ON public.deals;

CREATE POLICY "deals: insert sales own or admin"
  ON public.deals FOR INSERT
  WITH CHECK (
    public.can_view_account(auth.uid(), account_id)
    AND (
      public.is_admin(auth.uid())
      OR (
        deal_owner_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role IN ('admin', 'sales', 'sales_manager')
        )
      )
    )
  );

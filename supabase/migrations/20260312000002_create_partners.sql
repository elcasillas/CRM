-- ── partners table ────────────────────────────────────────────────────────────
-- Partners are a first-class entity: resellers, ISPs, telecoms, wholesale
-- distributors, and strategic channel partners. They optionally link to a CRM
-- account (soft link for cross-referencing deals / contracts), but they are
-- their own entity with dedicated health scoring.

CREATE TABLE public.partners (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name       text        NOT NULL,
  partner_type       text        NOT NULL
                                 CHECK (partner_type IN ('reseller','isp','telecom','wholesale','strategic','other')),
  tier               text        NOT NULL DEFAULT 'tier2'
                                 CHECK (tier IN ('enterprise','tier1','tier2','tier3')),
  status             text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','at_risk','churned','onboarding','inactive')),
  account_id         uuid        REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_manager_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  region             text,
  country            text,
  website            text,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;


-- ── RLS helper: can_view_partner ──────────────────────────────────────────────
-- A user can view a partner if they are:
--   1. The assigned account manager (account_manager_id = uid)
--   2. An admin
--   3. Able to view the linked CRM account (account_owner or service_manager)

CREATE OR REPLACE FUNCTION public.can_view_partner(uid uuid, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = p_id
      AND (
        p.account_manager_id = uid
        OR public.is_admin(uid)
        OR (p.account_id IS NOT NULL AND public.can_view_account(uid, p.account_id))
      )
  );
$$;


-- ── RLS policies for partners ─────────────────────────────────────────────────

CREATE POLICY "partners: select visible"
  ON public.partners FOR SELECT
  USING (public.can_view_partner(auth.uid(), id));

CREATE POLICY "partners: insert owner or admin"
  ON public.partners FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    OR account_manager_id = auth.uid()
  );

CREATE POLICY "partners: update owner or admin"
  ON public.partners FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    OR account_manager_id = auth.uid()
  );

CREATE POLICY "partners: delete admin only"
  ON public.partners FOR DELETE
  USING (public.is_admin(auth.uid()));


-- ── Update can_view_note_entity to support 'partner' entity type ──────────────
-- Notes with entity_type='partner' are visible if the user can view the partner.

CREATE OR REPLACE FUNCTION public.can_view_note_entity(uid uuid, etype text, eid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE etype
    WHEN 'account'  THEN public.can_view_account(uid, eid)
    WHEN 'deal'     THEN public.can_view_account(uid,
                           (SELECT account_id FROM public.deals WHERE id = eid))
    WHEN 'contact'  THEN public.can_view_account(uid,
                           (SELECT account_id FROM public.contacts WHERE id = eid))
    WHEN 'contract' THEN public.can_view_account(uid,
                           (SELECT account_id FROM public.contracts WHERE id = eid))
    WHEN 'hid'      THEN public.can_view_account(uid,
                           (SELECT account_id FROM public.hid_records WHERE id = eid))
    WHEN 'partner'  THEN public.can_view_partner(uid, eid)
    ELSE false
  END;
$$;

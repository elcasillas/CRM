-- ─────────────────────────────────────────────────────────────────────────────
-- Move the RLS visibility predicates out of the exposed API schema
--
-- is_admin, can_view_account, can_view_note_entity and can_view_partner have to
-- keep EXECUTE for authenticated: they are called from inside RLS policies, and
-- a policy expression is evaluated as the querying role. Revoking would make
-- every table read fail. That left them callable over /rest/v1/rpc, where a
-- signed-in user could probe who is an admin or which accounts another user can
-- see. Flagged as 0029_authenticated_security_definer_function_executable.
--
-- The remedy is the third one the advisor offers: take them out of the exposed
-- schema. PostgREST only exposes public, so a function in `private` is no
-- longer reachable over the API while remaining callable inside policies.
--
-- ALTER FUNCTION ... SET SCHEMA preserves the function OID, and policies
-- reference functions by OID, so all 60 policy references across the 77
-- policies keep working untouched. Privileges are preserved by the move too.
--
-- The bodies do need rewriting: they call each other by qualified name, so
-- public.is_admin becomes private.is_admin. CREATE OR REPLACE also preserves
-- the OID. Both steps are in this one migration, so there is no window where a
-- body points at a function that has moved.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS private;

-- Callable inside policies, but not exposed: PostgREST serves public only.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.is_admin(uuid)                          SET SCHEMA private;
ALTER FUNCTION public.can_view_account(uuid, uuid)            SET SCHEMA private;
ALTER FUNCTION public.can_view_partner(uuid, uuid)            SET SCHEMA private;
ALTER FUNCTION public.can_view_note_entity(uuid, text, uuid)  SET SCHEMA private;

-- Repoint the cross references now that the four live in `private`.
-- Table references stay qualified to public. search_path stays empty.

CREATE OR REPLACE FUNCTION private.is_admin(uid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_view_account(uid uuid, acct_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT (
    private.is_admin(uid)
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = uid AND role = 'sales_manager'
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = acct_id
        AND (a.account_owner_id = uid OR a.service_manager_id = uid)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_view_partner(uid uuid, p_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = p_id
      AND (
        p.account_manager_id = uid
        OR private.is_admin(uid)
        OR (p.account_id IS NOT NULL AND private.can_view_account(uid, p.account_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_view_note_entity(uid uuid, etype text, eid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT CASE etype
    WHEN 'account'  THEN private.can_view_account(uid, eid)
    WHEN 'deal'     THEN private.can_view_account(uid,
                           (SELECT account_id FROM public.deals WHERE id = eid))
    WHEN 'contact'  THEN private.can_view_account(uid,
                           (SELECT account_id FROM public.contacts WHERE id = eid))
    WHEN 'contract' THEN private.can_view_account(uid,
                           (SELECT account_id FROM public.contracts WHERE id = eid))
    WHEN 'hid'      THEN private.can_view_account(uid,
                           (SELECT account_id FROM public.hid_records WHERE id = eid))
    WHEN 'partner'  THEN private.can_view_partner(uid, eid)
    ELSE false
  END;
$function$;

-- Privileges survive the move, but restate them so intent is explicit.
REVOKE EXECUTE ON FUNCTION private.is_admin(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_view_account(uuid, uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_view_partner(uuid, uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_view_note_entity(uuid, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_admin(uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_account(uuid, uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_partner(uuid, uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_note_entity(uuid, text, uuid) TO authenticated, service_role;

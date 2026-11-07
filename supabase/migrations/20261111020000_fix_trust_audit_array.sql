-- Fix: placement_trust_audit appended to a text[] with v_fields || 'name'.
-- Postgres reads the untyped literal as an array literal and raises 22P02,
-- so any non-admin edit of pricing, image_url, dimensions or audience failed.
-- Found by scripts/check-partner-portal.sql on 2026-11-01. Same function body as
-- live (pg_get_functiondef), with only the four appends changed to array_append.
CREATE OR REPLACE FUNCTION public.placement_trust_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_web_non_admin     boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin();
  v_trusted           boolean := coalesce(current_setting('nowopen.owner_write', true), '') = 'on';
  v_lifecycle_changed boolean;
  v_owner_changed     boolean;
  v_fields            text[] := '{}';
  v_src               record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_lifecycle_changed := NEW.lifecycle <> 'imported';
    v_owner_changed     := NEW.owner_id IS NOT NULL;
  ELSE
    v_lifecycle_changed := NEW.lifecycle IS DISTINCT FROM OLD.lifecycle;
    v_owner_changed     := (NEW.owner_id, NEW.owner_role) IS DISTINCT FROM (OLD.owner_id, OLD.owner_role);

    -- Fields a non-admin edited. A verified source no longer describes them.
    IF v_web_non_admin THEN
      IF NEW.pricing IS DISTINCT FROM OLD.pricing THEN v_fields := array_append(v_fields, 'pricing'::text); END IF;
      IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN v_fields := array_append(v_fields, 'image_url'::text); END IF;
      IF NEW.dimensions IS DISTINCT FROM OLD.dimensions THEN v_fields := array_append(v_fields, 'dimensions'::text); END IF;
      IF (NEW.audience_note, NEW.estimated_daily_traffic)
         IS DISTINCT FROM (OLD.audience_note, OLD.estimated_daily_traffic) THEN
        v_fields := array_append(v_fields, 'audience'::text);
      END IF;
    END IF;
  END IF;

  IF cardinality(v_fields) > 0 THEN
    FOR v_src IN
      UPDATE public.placement_field_source s
         SET basis = 'partner_supplied', as_of = (now() AT TIME ZONE 'Africa/Lagos')::date
       WHERE s.advert_id = NEW.id
         AND s.basis = 'verified'
         AND s.field = ANY (v_fields)
      RETURNING s.id, s.field
    LOOP
      INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
      VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.field_source_downgrade', 'advertisement', NEW.id::text,
              jsonb_build_object(
                'field_source_id', v_src.id,
                'field', v_src.field,
                'from', 'verified',
                'to', 'partner_supplied',
                'via', coalesce(auth.role(), 'direct')));
    END LOOP;
  END IF;

  IF NOT (v_lifecycle_changed OR v_owner_changed) THEN
    RETURN NULL;
  END IF;

  -- Defence in depth: placement_trust_guard already refuses this caller.
  IF v_web_non_admin AND NOT v_trusted THEN
    RAISE EXCEPTION 'Only an admin can change a placement''s owner or lifecycle' USING errcode = '42501';
  END IF;

  IF v_lifecycle_changed THEN
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.lifecycle', 'advertisement', NEW.id::text,
            jsonb_build_object(
              'from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.lifecycle END,
              'to', NEW.lifecycle,
              'reason', nullif(current_setting('nowopen.lifecycle_reason', true), ''),
              'via', CASE WHEN v_trusted THEN 'owner_portal' ELSE coalesce(auth.role(), 'direct') END));
  END IF;

  IF v_owner_changed THEN
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.owner_link', 'advertisement', NEW.id::text,
            jsonb_build_object(
              'from_owner', CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_id END,
              'from_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_role END,
              'to_owner', NEW.owner_id,
              'to_role', NEW.owner_role,
              'via', CASE WHEN v_trusted THEN 'owner_portal' ELSE coalesce(auth.role(), 'direct') END));
  END IF;

  RETURN NULL;
END;
$function$;

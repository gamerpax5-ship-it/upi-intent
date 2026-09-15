-- Immutable deposit bindings even for privileged maintenance mistakes.
CREATE FUNCTION wpay_auth.funding_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 IF (NEW.id,NEW.owner_id,NEW.tenant_id,NEW.idempotency_key,NEW.snapshot,NEW.payload_digest,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.owner_id,OLD.tenant_id,OLD.idempotency_key,OLD.snapshot,OLD.payload_digest,OLD.created_at) THEN
  RAISE EXCEPTION 'Immutable funding request binding';
 END IF;
 RETURN NEW;
END $guard$;
CREATE TRIGGER immutable_binding BEFORE UPDATE ON wpay_auth.funding_requests FOR EACH ROW EXECUTE FUNCTION wpay_auth.funding_binding_guard();
CREATE TRIGGER no_delete BEFORE DELETE ON wpay_auth.funding_requests FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON wpay_auth.funding_requests FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();

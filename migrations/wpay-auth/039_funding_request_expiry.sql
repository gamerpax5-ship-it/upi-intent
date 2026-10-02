-- Expire untouched USDT deposit requests after 10 minutes.
-- Historical rows remain auditable; only the state machine gains an explicit expired terminal state.
ALTER TABLE wpay_auth.funding_requests
  DROP CONSTRAINT funding_requests_state_check;

ALTER TABLE wpay_auth.funding_requests
  ADD CONSTRAINT funding_requests_state_check
  CHECK(state IN('requested','detected','confirming','review','confirmed','rejected','reversed','expired'));

UPDATE wpay_auth.funding_requests
SET state='expired',
    reason='Deposit request expired after 10 minutes',
    updated_at=CURRENT_TIMESTAMP
WHERE state='requested'
  AND created_at<=CURRENT_TIMESTAMP-interval '10 minutes';

INSERT INTO wpay_auth.funding_events(id,request_id,actor_id,kind,reason,provenance)
SELECT gen_random_uuid(),r.id,NULL,'expired','Deposit request expired after 10 minutes',
       jsonb_build_object('expiresAfterMinutes',10,'migration',true)
FROM wpay_auth.funding_requests r
WHERE r.state='expired'
  AND r.reason='Deposit request expired after 10 minutes'
  AND NOT EXISTS(
    SELECT 1 FROM wpay_auth.funding_events e
    WHERE e.request_id=r.id AND e.kind='expired'
  );

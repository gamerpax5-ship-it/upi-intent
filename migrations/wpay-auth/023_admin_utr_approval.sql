-- Administrative settlement is explicitly distinct from bank verification.
-- Existing NOT NULL and unique bank/UTR and reservation constraints remain.
ALTER TABLE wpay_auth.gateway_orders DROP CONSTRAINT gateway_orders_evidence_state_check;
ALTER TABLE wpay_auth.gateway_orders ADD CONSTRAINT gateway_orders_evidence_state_check CHECK(evidence_state IN('unavailable','claim_submitted','observed','verified','rejected','admin_approved'));
ALTER TABLE wpay_auth.business_financial_events DROP CONSTRAINT business_financial_events_source_check;
ALTER TABLE wpay_auth.business_financial_events ADD CONSTRAINT business_financial_events_source_check CHECK(source IN('normal','statement_recovered','admin_manual'));
WITH changed AS (
 UPDATE wpay_auth.grants g SET permissions=g.permissions||ARRAY['utr_center.approve'],permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN('admin','super_admin')
 AND 'utr_center.view'=ANY(g.permissions) AND 'statement_reconciliation.upload'=ANY(g.permissions)
 AND NOT ('utr_center.approve'=ANY(g.permissions)) RETURNING g.account_id,g.permission_version
)
UPDATE wpay_auth.accounts a SET permission_version=c.permission_version,session_epoch=a.session_epoch+1 FROM changed c WHERE a.id=c.account_id;

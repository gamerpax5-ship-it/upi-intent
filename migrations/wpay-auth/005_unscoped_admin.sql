-- APK administration uses the existing explicit admin_tenants scope.
-- Remove the Task 7 additive APK grant only where no such scope exists.
-- Preserve all other grants and all earlier migration checksums.
WITH corrected AS (
 UPDATE wpay_auth.grants g
 SET permissions=array_remove(g.permissions,'apk.view'),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a
 WHERE a.id=g.account_id AND a.account_type='admin' AND 'apk.view'=ANY(g.permissions)
   AND (g.admin_scope IS NULL OR COALESCE(jsonb_array_length(g.admin_scope->'tenantIds'),0)=0)
 RETURNING g.account_id
)
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1
 WHERE id IN (SELECT account_id FROM corrected);

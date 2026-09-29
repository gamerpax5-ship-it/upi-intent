'use strict';
const {AuthError}=require('./errors');
const {recentAuthenticationAt}=require('./session-assurance');
// Called after normal session validation and in addition to resource permissions.
// MFA remains a login factor, not a repeated transaction factor.
function requireTransactionPassword(row){
 const optional=['user','merchant','admin','super_admin','employee'].includes(row?.account_type);
 const at=optional?(row.transaction_password_at??(row.auth_method==='password'?row.password_at:null)):recentAuthenticationAt(row),age=+new Date(row?.database_now)-+new Date(at);
 if(!at||!row?.database_now||!Number.isFinite(age)||age<0||age>300000)throw new AuthError(optional?'RECENT_PASSWORD_REQUIRED':'RECENT_MFA_REQUIRED');
}
module.exports={requireTransactionPassword};

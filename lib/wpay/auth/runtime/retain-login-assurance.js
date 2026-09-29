'use strict';
const {AuthError}=require('./errors');
const {sessionAssurance}=require('./session-assurance');
const {token,digest}=require('./tokens');
// Credential changes revoke old sessions, but do not invent a new MFA event.
async function renew(service,client,previous,next){
 if(!sessionAssurance(previous)||previous.id!==next.id||previous.mfa_enabled!==next.mfa_enabled||previous.factor_version!==next.factor_version)throw new AuthError('AUTH_FAILED');
 if(!next.mfa_enabled)return require('./optional-mfa').issue(service,client,next);
 const sessionToken=token();
 await service.repository.promote(client,next,digest(sessionToken),service.mfa.validate,previous.mfa_at);
 return {stage:'authenticated',sessionToken};
}
module.exports={renew};

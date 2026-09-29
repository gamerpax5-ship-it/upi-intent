'use strict';
const validation=require('./validation'),{AuthError}=require('../auth/runtime/errors');
// All bank persistence and idempotency comparisons use this boundary. Keep
// free-form reason handling independent from credential-sensitive bank notes.
function bank(input){
 if(typeof input?.notes==='string'&&/password|secret|bearer\s|\bpin\b|\botp\b|private.?key|seed phrase|recovery code/i.test(input.notes))throw new AuthError('INVALID_INPUT');
 return validation.bank(input);
}
module.exports={bank};

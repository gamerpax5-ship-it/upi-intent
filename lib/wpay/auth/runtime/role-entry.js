"use strict";
const {AuthError}=require('./errors');
const ROLES=Object.freeze({admin:Object.freeze(['admin','super_admin']),merchant:Object.freeze(['merchant']),user:Object.freeze(['user']),employee:Object.freeze(['employee'])});
function requireRole(account,entry){if(entry!==undefined&&(!Object.hasOwn(ROLES,entry)||!ROLES[entry].includes(account?.account_type)))throw new AuthError('AUTH_FAILED');}
function registrationRole(body,entry){if(entry!==undefined&&(!['user','merchant'].includes(entry)||body?.accountType!==entry))throw new AuthError('FORBIDDEN');}
module.exports={ROLES,requireRole,registrationRole};

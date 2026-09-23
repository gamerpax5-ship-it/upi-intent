"use strict";
const {fullAssurance,approvalAllows}=require('./mfa');
const isAdmin=row=>['admin','super_admin'].includes(row?.account_type);
function passwordAssurance(row){
 if(!(isAdmin(row)||(['user','merchant'].includes(row?.account_type)&&row.mfa_enabled===false))||row.auth_method!=='password'||row.mfa_at!==null||!row.password_at||!row.created_at||!row.database_now)return false;
 const at=+new Date(row.password_at),created=+new Date(row.created_at),now=+new Date(row.database_now);
 return approvalAllows(row)&&[at,created,now].every(Number.isFinite)&&at>=created&&at<=now&&
 Number.isSafeInteger(row.security_version)&&row.security_version>0&&row.session_security_version===row.security_version&&
 Number.isSafeInteger(row.factor_version)&&row.factor_version>=0&&row.session_factor_version===row.factor_version;
}
const sessionAssurance=row=>row?.auth_method==='password'?passwordAssurance(row):fullAssurance(row);
const recentAuthenticationAt=row=>passwordAssurance(row)?row.password_at:row?.mfa_at;
module.exports={isAdmin,passwordAssurance,sessionAssurance,recentAuthenticationAt};

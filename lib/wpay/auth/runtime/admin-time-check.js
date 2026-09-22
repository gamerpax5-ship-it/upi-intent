"use strict";
// Public clock confirmation only. Password and authenticator remain mandatory.
const requiresIst = row => ['admin','super_admin'].includes(row?.account_type);
function validIst(value, now) {
  if(typeof value !== 'string' || !/^[0-9]{4}$/.test(value) || !now) return false;
  const time = +new Date(now);
  if(!Number.isFinite(time)) return false;
  const ist = new Date(time + 330 * 60000);
  return value === String(ist.getUTCHours()).padStart(2,'0') + String(ist.getUTCMinutes()).padStart(2,'0');
}
module.exports = {requiresIst,validIst};

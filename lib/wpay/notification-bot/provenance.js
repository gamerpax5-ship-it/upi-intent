'use strict';
function manual(state){return state==='admin_approved'||state==='user_confirmed';}
function method(state){return state==='user_confirmed'?'user_manual':state==='admin_approved'?'admin_manual':'bank_evidence';}
function successMessage(state){return state==='user_confirmed'?'User confirmed — payment Successful.':state==='admin_approved'?'Admin approved — payment Successful.':'Verified — payment Successful.';}
module.exports={manual,method,successMessage};

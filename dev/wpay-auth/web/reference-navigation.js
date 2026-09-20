"use strict";
(function(root){
 const routes={
  user:{overview:['user.dashboard'],analytics:['user.analytics'],'bank-upi':['user.bank-upi'],'upi-analytics':['user.onboarding-upi-analytics'],'upi-verification':['user.onboarding-upi-verification'],statements:['user.onboarding-statements'],'usdt-deposit':['user.usdt-deposit'],commission:['payout.commission'],withdraw:['payout.withdrawals'],holds:['user.holds'],payins:['operations.transactions'],payouts:['payout.jobs'],'parking-beneficiaries':['parking.beneficiaries'],'parking-orders':['parking.orders'],transactions:['payout.jobs','parking.orders'],agent:['user.apk-download'],activation:['user.activation-codes'],devices:['operations.devices'],otp:['operations.otp'],trade:['user.trade'],guide:['user.guide'],notifications:['user.notifications'],support:['user.support'],security:['user.account-security'],settings:['user.profile'],profile:['user.profile']},
  merchant:{dashboard:['merchant.dashboard'],analytics:['merchant.analytics'],links:['gateway.orders'],orders:['gateway.orders'],transactions:['gateway.orders'],payouts:['payout.orders'],'payout-review':['payout.orders'],api:['gateway.orders'],webhooks:['gateway.orders'],logs:['gateway.orders'],docs:['merchant.api-documentation'],fees:['merchant.fees'],ledger:['merchant.ledger'],holds:['merchant.holds'],settlement:['payout.merchant-usdt'],reports:['merchant.reports'],notifications:['merchant.notifications'],support:['merchant.support'],security:['merchant.account-security'],profile:['merchant.profile']}
 };
 function resolve(role,key,groups){
  const candidates=routes[role]?.[key];if(!candidates)return null;
  const pages=(groups||[]).flatMap(g=>g.children||[]);
  for(const id of candidates){const page=pages.find(p=>p.destinationId===id&&p.routeStatus!=='unavailable');if(page)return page;}
  return null;
 }
 const api=Object.freeze({routes,resolve});
 if(typeof module==='object'&&module.exports)module.exports=api;else root.WPayReferenceNavigation=api;
})(globalThis);

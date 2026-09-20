"use strict";
const {canUsePermission}=require('../authorization-policy');
// Runtime readiness is separate from the permission catalog's design descriptors.
// A grant can never expose a route with no implementation.
const IMPLEMENTED=new Set(['profile.view','account_security.view','user.overview.view','merchant.overview.view','overview.view',
 'users.view','merchants.view','user.apk.view','apk.view','user.source_events.view','merchant.source_events.view','merchant.api_docs.view',
 'user.bank_upi.submit','user.bank_upi.view','bank_upi.view','assignments.view','routing.view','ledger.view','merchant.ledger.view','merchant.fees.view','user.payin_commission.view','user.holds.view','merchant.holds.view','holds.view','user.deposits.view','deposits.view',
 'support.view','guide.view','support_admin.view','notifications.view','user.analytics.view','merchant.analytics.view','user.activation_codes.view','transactions.view','webhooks.view','reports.view','reports.export','api_credentials.view','api_logs.view','devices.view','settings.view','ledger.adjust','user.trade.view']);
function ready(page){return IMPLEMENTED.has(page.permissionId)||/^(operations\.(devices|otp|employees|transactions|statements)|gateway\.orders|payout\.[a-z-]+|parking\.(beneficiaries|orders|admin)|user\.onboarding-[a-z-]+)$/.test(page.destinationId);}
function navigation(groups,context){
 const output=groups.map(g=>({...g,children:g.children.filter(ready).filter(p=>!(p.destinationId==='gateway.orders'&&['admin','super_admin','employee'].includes(context.principal.type)&&groups.some(group=>group.children.some(child=>child.destinationId==='administration.transactions')))).map(p=>({...p,routeStatus:p.permissionId==='user.trade.view'?'coming-soon':'implemented'}))})).filter(g=>g.children.length);
 if(context.principal.type==='merchant'&&canUsePermission({...context,permissionId:'merchant.analytics.view'}).allowed){
  let finance=output.find(g=>g.id==='merchant.group.finance');if(!finance){finance={id:'merchant.group.finance',label:'Finance',children:[]};output.push(finance);}
  finance.children.push({id:'merchant.page.reports',destinationId:'merchant.reports',permissionId:'merchant.analytics.view',label:'Reports',routeStatus:'implemented',descriptorOnly:false,blockers:[]});
 }
 if(['admin','super_admin','employee'].includes(context.principal.type)){
  let settings=output.find(g=>g.id==='administration.group.settings');
  for(const [id,permissionId,label]of [['profile','profile.view','Profile'],['notifications','notifications.view','Notifications']]){
   if(!canUsePermission({...context,permissionId}).allowed)continue;if(!settings){settings={id:'administration.group.settings',label:'Settings',children:[]};output.push(settings);}
   settings.children.push({id:'completion.page.'+id,destinationId:'completion.'+id,permissionId,label,routeStatus:'implemented',descriptorOnly:false,blockers:[]});
  }
 }
 return output;
}
module.exports={IMPLEMENTED,ready,navigation};

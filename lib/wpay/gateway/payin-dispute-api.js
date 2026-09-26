"use strict";
const {authorize}=require("../authorization-policy"),{AuthError}=require("../auth/runtime/errors"),v=require("../business/validation");
const {recentAuthenticationAt}=require("../auth/runtime/session-assurance");
const fail=(code="FORBIDDEN")=>{throw new AuthError(code);};
const OPS=["payin-dispute/search","payin-dispute/get","payin-dispute/open","payin-dispute/respond","payin-dispute/resolve","payin-dispute/proof"];
function permit(context,permission,resource={kind:"list"}){const r=authorize({...context,permissionId:permission,context:resource});if(!r.allowed)fail();return r.constraints.where;}
function own(row,kind="record"){return {kind,id:row.id,tenantId:row.tenant_id,ownerType:row.account_type,ownerId:row.user_id||row.merchant_id||row.id};}
function recent(row){const at=recentAuthenticationAt(row),age=+new Date(row.database_now)-+new Date(at);if(!at||!Number.isFinite(age)||age<0||age>300000)fail("RECENT_MFA_REQUIRED");}
function preparation(context,row,operation){
 if(operation==="payin-dispute/open"){if(row.account_type!=="merchant")fail();permit(context,"merchant.payin_dispute.open",own(row));recent(row);return;}
 if(operation==="payin-dispute/respond"){if(row.account_type!=="user")fail();permit(context,"user.payin_dispute.respond",own(row));recent(row);return;}
}
async function account(c,id){const r=(await c.query("SELECT id,tenant_id,account_type,user_id,merchant_id FROM wpay_auth.accounts WHERE id=$1",[v.id(id)])).rows[0];if(!r)fail();return r;}
function resource(a,id=a.id){return {kind:"record",id,tenantId:a.tenant_id,ownerType:a.account_type,ownerId:a.user_id||a.merchant_id||a.id};}
async function run(engine,c,row,context,operation,body,prepared){
 if(!OPS.includes(operation))throw new AuthError("NOT_FOUND");const merchant=row.account_type==="merchant",user=row.account_type==="user",admin=!merchant&&!user;
 if(operation==="payin-dispute/search"){
  const scope=permit(context,merchant?"merchant.payin_dispute.view":user?"user.payin_dispute.view":"payin_dispute.view",merchant||user?own(row,"list"):{kind:"list"});
  if(body&&Object.keys(body).some(k=>!["offset","status"].includes(k)))fail("INVALID_INPUT");const offset=body?.offset??0,status=body?.status??"";
  if(!Number.isInteger(offset)||offset<0||offset>100000||!["","pending","payment_valid","payment_invalid"].includes(status))fail("INVALID_INPUT");
  const rows=(await c.query(`SELECT d.order_id,o.reference,d.merchant_id,m.name AS merchant_name,d.user_id,u.name AS user_name,d.amount_minor::text,d.commission_minor::text,d.merchant_net_minor::text,d.reason,d.coverage_from,d.coverage_through,d.created_at,
   COALESCE(z.outcome,'pending') AS status,z.created_at AS resolved_at
   FROM wpay_auth.payin_disputes d JOIN wpay_auth.gateway_orders o ON o.id=d.order_id
   JOIN wpay_auth.accounts m ON m.id=d.merchant_id JOIN wpay_auth.accounts u ON u.id=d.user_id
   LEFT JOIN wpay_auth.payin_dispute_resolutions z ON z.dispute_id=d.id
   WHERE ($1::uuid IS NULL OR d.merchant_id=$1) AND ($2::uuid IS NULL OR d.user_id=$2)
   AND ($3::text[] IS NULL OR (m.tenant_id=ANY($3) AND u.tenant_id=ANY($3)))
   AND ($4='' OR COALESCE(z.outcome,'pending')=$4)
   ORDER BY d.created_at DESC,d.id LIMIT 51 OFFSET $5`,[merchant?row.id:null,user?row.id:null,admin?scope.tenantIds:null,status,offset])).rows;
  return {records:rows.slice(0,50).map(x=>({orderId:x.order_id,reference:x.reference,merchantId:x.merchant_id,merchantName:x.merchant_name,userId:x.user_id,userName:x.user_name,amountMinor:x.amount_minor,commissionMinor:x.commission_minor,merchantNetMinor:x.merchant_net_minor,reason:x.reason,coverageFrom:x.coverage_from,coverageThrough:x.coverage_through,createdAt:x.created_at,status:x.status,resolvedAt:x.resolved_at})),hasMore:rows.length>50,offset};
 }
 v.id(body?.id);
 const target=await engine.target(c,body.id,false);if(!target)fail();
 if(operation==="payin-dispute/open"){
  if(!merchant||target.merchant_id!==row.id)fail();permit(context,"merchant.payin_dispute.open",resource(await account(c,row.id),target.id));recent(row);return engine.open(c,row.id,body,prepared);
 }
 if(operation==="payin-dispute/respond"){
  if(!user||target.user_id!==row.id)fail();permit(context,"user.payin_dispute.respond",resource(await account(c,row.id),target.id));recent(row);return engine.respond(c,row.id,body,prepared);
 }
 if(operation==="payin-dispute/get"){
  const permission=merchant?"merchant.payin_dispute.view":user?"user.payin_dispute.view":"payin_dispute.view";
  if(merchant&&target.merchant_id!==row.id||user&&target.user_id!==row.id)fail();
  if(admin){permit(context,permission,resource(await account(c,target.merchant_id),target.id));permit(context,permission,resource(await account(c,target.user_id),target.id));}else permit(context,permission,resource(await account(c,row.id),target.id));
  return engine.detail(c,target.id);
 }
 if(!admin)fail();const merchantAccount=await account(c,target.merchant_id),userAccount=await account(c,target.user_id);
 if(operation==="payin-dispute/resolve"){permit(context,"payin_dispute.resolve",resource(merchantAccount,target.id));permit(context,"payin_dispute.resolve",resource(userAccount,target.id));recent(row);return engine.resolve(c,row.id,body);}
 if(operation==="payin-dispute/proof"){v.exactFields(body,["id","proofId"]);permit(context,"payin_dispute.proof",resource(merchantAccount,target.id));permit(context,"payin_dispute.proof",resource(userAccount,target.id));recent(row);return engine.download(c,target.id,body.proofId,row.id);}
 fail();
}
module.exports={run,preparation,OPS};

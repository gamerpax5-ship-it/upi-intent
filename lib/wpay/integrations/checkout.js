"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors'),{transaction}=require('../db/migrations');
const alias=secret=>'WP'+createHash('sha256').update(secret).digest('hex').slice(0,8);
const cookieName='wpay_checkout';
function authority(header,id){
 const values=String(header||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));
 if(values.length!==1)throw new AuthError('NOT_FOUND');const secret=values[0].slice(cookieName.length+1);
 if(!/^[A-Za-z0-9_-]{43}$/.test(secret)||alias(secret)!==id)throw new AuthError('NOT_FOUND');return secret;
}
async function loadCheckout(){
 const root=path.join(__dirname,'../../../public'),files=new Map();
 for(const [url,file,type]of [['page','pay.html','text/html'],['/checkout.js','checkout.js','text/javascript'],['/upi.js','upi.js','text/javascript']])files.set(url,[await fs.readFile(path.join(root,file)),type]);
 // Protected source files and deeplink scripts remain unchanged. The hosted
 // composition adds an isolated, server-authoritative status presentation.
 const [pageBytes,pageType]=files.get('page');
 files.set('page',[Buffer.from(pageBytes.toString().replace('</body>','<script src="/wpay-auth/checkout-status.js" defer></script></body>')),pageType]);
 // The pinned QR
 // dependency is the only external script admitted by this page's policy.
 const csp="default-src 'none'; script-src 'self' https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
 return async function checkout(req,res,{service,origin,secure,readBody,send}){
  const entry=/^\/wpay-pay\/([A-Za-z0-9_-]{43})$/.exec(req.url),page=/^\/pay\/(WP[a-f0-9]{8})$/.exec(req.url),api=/^\/api\/payments\/(WP[a-f0-9]{8})(\/utr|\/verification-status)?$/.exec(req.url);
  if(entry&&req.method==='GET'){
   await transaction(service.repository.pool,c=>service.gateway.customer(c,entry[1]));const id=alias(entry[1]);
   res.setHeader('Set-Cookie',`${cookieName}=${entry[1]}; Path=/api/payments/${id}; HttpOnly; SameSite=Strict; Max-Age=43200${secure?'; Secure':''}`);
   res.statusCode=303;res.setHeader('Location','/pay/'+id);res.end();return true;
  }
  if(req.method==='GET'&&(page||files.has(req.url))){const [bytes,type]=files.get(page?'page':req.url);res.setHeader('Content-Security-Policy',csp);send(res,200,bytes,type);return true;}
  if(!api)return false;
  const secret=authority(req.headers.cookie,api[1]);let utr;
  if(req.method==='POST'&&api[2]==='/utr'){
   if(req.headers.origin!==origin)throw new AuthError('CSRF_FAILED');const body=await readBody(req);
   require('../auth/runtime/validation').exactFields(body,['utr']);if(typeof body.utr!=='string')throw new AuthError('INVALID_INPUT');utr=body.utr;
  }else if(req.method!=='GET'||api[2]==='/utr')throw new AuthError('NOT_FOUND');
  const result=await transaction(service.repository.pool,c=>service.gateway.customer(c,secret,utr));
  const verified=result.status==='successful'&&result.evidenceStatus==='verified';
  if(!api[2]){
   // The original checkout requires its UPI URI even when reopening a paid or
   // expired order. Read only the reservation bound to the validated token.
   const uri=result.uri||await transaction(service.repository.pool,async c=>{
    const r=(await c.query(`SELECT v.details FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id JOIN wpay_auth.business_bank_versions v ON v.bank_id=r.bank_id AND v.version=r.bank_version WHERE o.id=$1 AND o.token_digest=$2`,[result.id,require('../gateway/core').hash(secret)])).rows[0];
    if(!r)throw new AuthError('NOT_FOUND');return require('../../../public/upi').manual(r.details.upiId,r.details.holderName,require('../business/money').format(result.amountMinor),'WPay '+result.id);
   });
   send(res,200,{upiUri:uri,expiresAt:result.expiresAt});
  }else send(res,200,{status:verified?'success':['verification_pending','recovery_review'].includes(result.status)?'pending':result.status,verified,message:verified?'Payment independently verified':'Waiting for independent payment evidence'});
  return true;
 };
}
module.exports={loadCheckout,alias,authority};

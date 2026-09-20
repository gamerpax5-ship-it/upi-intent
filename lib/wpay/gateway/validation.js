"use strict";
const {AuthError}=require('../auth/runtime/errors'),v=require('../business/validation'),money=require('../business/money');
const bad=()=>{throw new AuthError('INVALID_INPUT');};
function text(value,max=200){if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))bad();return value;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function fields(value,allowed){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!allowed.includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))bad();return value;}
function order(body){fields(body,['reference','idempotencyKey','amountMinor','currency','description','metadata']);v.reference(body.reference);v.reference(body.idempotencyKey);
 if(body.currency!=='INR'||money.minor(body.amountMinor)>money.MAX)bad();
 const metadata=body.metadata??{};if(!metadata||Array.isArray(metadata)||typeof metadata!=='object'||Object.keys(metadata).length>12)bad();
 for(const [k,val] of Object.entries(metadata)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(k))bad();text(val,200);}if(JSON.stringify(metadata).length>2048)bad();
 return {reference:body.reference,idempotencyKey:body.idempotencyKey,amountMinor:body.amountMinor,currency:'INR',description:text(body.description??''),metadata:canonical(metadata)};
}
module.exports={order,text,canonical,fields};

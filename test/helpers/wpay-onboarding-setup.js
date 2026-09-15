"use strict";
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Onboarding}=require('../../lib/wpay/onboarding/workflow');
// Explicit synthetic setup for existing accounting tests. Uses the real bounded
// parser and per-bank/version acceptance; supplies no financial evidence.
const csv='Date,Narration,Debit,Credit,Balance\n15/09/2026,UPI/123456789012 received,,1250.50,2250.50';
async function statement(tx,owner,bank){const result=await tx(c=>new Onboarding().upload(c,owner,{bankId:bank.id,version:bank.version,requestId:randomUUID(),format:'csv',base64:Buffer.from(csv).toString('base64')}));assert.equal(result.status,'accepted');return result;}
async function startEnabled(tx,core,owner){await tx(async c=>{const rows=(await c.query("SELECT id,version FROM wpay_auth.business_bank_accounts WHERE owner_id=$1 AND status='enabled'",[owner])).rows;for(const bank of rows)await core.transitionBank(c,bank.id,bank.version,'run',owner,{reason:'Explicit synthetic fixture Start after prerequisites'});});}
module.exports={statement,startEnabled,csv};

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {AuthoritativeStatementSource}=require('../lib/wpay/integrations/authoritative-statement-source'),{digest}=require('../lib/wpay/business/ledger');
function fixture(){
 const now=Date.now(),snapshot={orderId:'order-a',reservationId:'reservation-a',merchantId:'merchant-a',userId:'user-a',bankId:'bank-a',bankVersion:1,upi:'synthetic@bank',accountDigest:'a'.repeat(64),amountMinor:'10000',currency:'INR',createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+1000).toISOString(),imports:[{id:'import-a',owner_id:'user-a',bank_id:'bank-a',bank_version:1,file_digest:'b'.repeat(64),result_digest:'c'.repeat(64),parser_digest:'d'.repeat(64)}]};
 let mapping={...Object.fromEntries(['orderId','reservationId','merchantId','userId','bankId','bankVersion','accountDigest'].map(k=>[k,snapshot[k]])),sourceId:'synthetic-source',id:'mapping-a',tenantId:'tenant-a',merchantTenantId:'tenant-b',sourceAccountId:'source-bank-a',version:1,active:true,revokedAt:null,validFrom:now-10000,validUntil:now+60000};
 const proof={...snapshot,imports:undefined,verified:true,final:true,status:'confirmed',source:'statement',evidenceId:'evidence-a',economicId:'economic-a',utr:'987654321012',receivedAt:new Date(now).toISOString(),statementImportId:'import-a',statementFileDigest:'b'.repeat(64),statementResultDigest:'c'.repeat(64),statementParserDigest:'d'.repeat(64),matcher:'protected-statement-match',accountScopeVerified:true,synthetic:true};
 const receipt={proof},attestation={id:'attestation-a',authenticated:true,independent:true,revoked:false,sourceId:mapping.sourceId,sourceAccountId:mapping.sourceAccountId,tenantId:mapping.tenantId,merchantTenantId:mapping.merchantTenantId,mappingId:mapping.id,mappingVersion:1,receiptDigest:digest(receipt),economicId:proof.economicId,requestDigest:digest(snapshot),checkedAt:now,validUntil:now+60000,synthetic:true};
 const source=new AuthoritativeStatementSource({sourceId:mapping.sourceId,resolveBinding:async()=>({...mapping}),read:async()=>structuredClone(receipt),attest:async()=>({...attestation}),allowSynthetic:true,clock:()=>now});return {source,snapshot,mapping,receipt,attestation,now};
}
const deny=p=>assert.rejects(p,e=>e.code==='FORBIDDEN');
test('independent statement adapter binds provenance and revalidates at accounting, without logging contents',async()=>{
 const f=fixture(),p=await f.source.verify(f.snapshot);assert.equal(p.provenance.sourceId,'synthetic-source');assert.equal(p.provenance.economicId,'economic-a');assert.equal(Object.hasOwn(p.provenance,'utr'),false);assert.ok(Object.isFrozen(p));assert.deepEqual(await f.source.beforePosting({},p),p.provenance);
 assert.deepEqual(await f.source.verify(f.snapshot),p);await deny(f.source.beforePosting({},structuredClone(p)));
});
test('disconnected source never manufactures proof',async()=>{assert.equal(await new AuthoritativeStatementSource({sourceId:'source'}).verify({}),null);});
test('every source mapping boundary denies cross-owner/tenant, stale versions and revocation',async()=>{
 for(const [key,value]of Object.entries({userId:'other',merchantId:'other',bankId:'other',bankVersion:2,accountDigest:'x',orderId:'other',reservationId:'other',sourceId:'other',active:false,revokedAt:1,version:0,validUntil:0})){
  const f=fixture();f.mapping[key]=value;await deny(f.source.verify(f.snapshot));
 }
 for(const key of ['tenantId','merchantTenantId','sourceAccountId','mappingId','economicId','requestDigest','receiptDigest']){const f=fixture();f.attestation[key]='other';await deny(f.source.verify(f.snapshot));}
});
test('client upload flags, unauthenticated source and malformed/stale attestations are not independent proof',async()=>{
 for(const [key,value]of Object.entries({authenticated:false,independent:false,revoked:true,checkedAt:0,validUntil:0})) {const f=fixture();f.attestation[key]=value;await deny(f.source.verify(f.snapshot));}
 for(const [key,value]of Object.entries({amountMinor:'999',statementImportId:'other',statementFileDigest:'bad',statementResultDigest:'bad',source:'normal'})){const f=fixture();f.receipt.proof[key]=value;await deny(f.source.verify(f.snapshot));}
 const f=fixture();f.source.allowSynthetic=false;await deny(f.source.verify(f.snapshot));
});
test('revocation/staleness/mapping change between lookup and posting denies; metadata spoof cannot bypass',async()=>{
 for(const mutation of [f=>{f.mapping.active=false;},f=>{f.mapping.version++;},f=>{f.attestation.revoked=true;},f=>{f.source.clock=()=>f.now+60001;}]){
  const f=fixture(),p=await f.source.verify(f.snapshot);mutation(f);await deny(f.source.beforePosting({},p));
 }
 const f=fixture();let reads=0;f.source.resolveBinding=async()=>({...f.mapping,version:++reads});await deny(f.source.verify(f.snapshot));
});

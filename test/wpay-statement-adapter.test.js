"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{AuthService}=require('../lib/wpay/auth/runtime/service');
test('trusted scoped statement result can supersede pending normal observation; upload metadata is not proof',async()=>{
 const snapshot={orderId:'order',reservationId:'reservation',merchantId:'merchant',userId:'user',bankId:'bank',bankVersion:1,upi:'test@bank',accountDigest:'digest',amountMinor:'100',currency:'INR',createdAt:new Date(Date.now()-10000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),claims:[]};
 const imported={id:'import',owner_id:'user',bank_id:'bank',bank_version:1,file_digest:'file',result_digest:'result'},pool={async query(sql,values){assert.deepEqual(values,['user','bank',1]);return {rows:[imported]};}};
 let proof=null;const service=new AuthService({pool},{paymentEvidenceVerifier:async s=>({...s,status:'pending',verified:false}),statementEvidenceVerifier:async()=>proof});
 assert.equal((await service.gateway.verifier(snapshot)).status,'pending');
 proof={...snapshot,source:'statement',status:'confirmed',verified:true,final:true,utr:'123456789012',economicId:'economic',evidenceId:'evidence',receivedAt:new Date().toISOString(),statementImportId:'import',statementFileDigest:'file',statementResultDigest:'result',accountScopeVerified:true,matcher:'protected-statement-match'};
 assert.equal((await service.gateway.verifier(snapshot)).source,'statement');
 for(const change of [{synthetic:true},{accountScopeVerified:false},{statementFileDigest:'other'},{userId:'other'},{statementImportId:'foreign'},{source:'normal'}]){const valid=proof;proof={...proof,...change};await assert.rejects(service.gateway.verifier(snapshot),e=>e.code==='FORBIDDEN');proof=valid;}
});

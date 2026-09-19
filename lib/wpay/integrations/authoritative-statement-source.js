"use strict";
const {AuthError}=require('../auth/runtime/errors');
const {validateEvidence}=require('../gateway/evidence');
const {digest}=require('../business/ledger');
const {providerRead,immutable}=require('./provider-read');
const fail=()=>{throw new AuthError('FORBIDDEN');};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(x);
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
// These functions are supplied by trusted server composition, never HTTP input.
// resolveBinding must read the authoritative mapping/current account state, and
// take a transactional share lock when a posting client is supplied. attest must
// independently authenticate the source receipt and query current revocation.
class AuthoritativeStatementSource {
 constructor({sourceId,resolveBinding,read,attest,allowSynthetic=false,clock=Date.now,maxAgeMs=60000}={}){
  if(!id(sourceId)||!Number.isInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>300000)throw Error('Invalid statement source policy');
  Object.assign(this,{sourceId,resolveBinding,read,attest,allowSynthetic,clock,maxAgeMs});this.accepted=new WeakMap();
 }
 configured(){return [this.resolveBinding,this.read,this.attest].every(x=>typeof x==='function');}
 async resolve(request,client){
  const r=await providerRead((_,options)=>this.resolveBinding(request,client,options),request,{timeoutMs:2000,attempts:1});
  if(r.state!=='response')throw new AuthError('UNAVAILABLE');return this.binding(request,r.value);
 }
 async attestation(receipt,scope){
  const {client,...input}=scope;
  const r=await providerRead((_,options)=>this.attest(receipt,{...scope,signal:options.signal}),{receipt,...input},{timeoutMs:2000,attempts:1});
  if(r.state!=='response')throw new AuthError('UNAVAILABLE');return r.value;
 }
 binding(snapshot,b){
  if(!b||b.sourceId!==this.sourceId||!id(b.id)||!id(b.tenantId)||!id(b.merchantTenantId)||!id(b.sourceAccountId)||!Number.isSafeInteger(b.version)||b.version<1||b.active!==true||b.revokedAt!=null||b.validFrom>this.clock()||b.validUntil<=this.clock()||!Number.isFinite(b.validFrom)||!Number.isFinite(b.validUntil))fail();
  for(const key of ['userId','merchantId','bankId','bankVersion','accountDigest','orderId','reservationId'])if(b[key]!==snapshot[key])fail();
  return b;
 }
 async verify(snapshot){
  if(!this.configured())return null;
  const request=immutable(structuredClone(snapshot));
  const mapping=await this.resolve(request);
  const response=await providerRead(this.read,{sourceId:this.sourceId,mapping:immutable(structuredClone(mapping)),request});
  if(response.state!=='response'||response.value==null)return null;
  const receipt=response.value,proof=receipt.proof;
  validateEvidence(request,proof,this.allowSynthetic);
  const imported=request.imports?.find(x=>x.id===proof.statementImportId);
  if(!imported||imported.owner_id!==request.userId||imported.bank_id!==request.bankId||imported.bank_version!==request.bankVersion||!hash(imported.file_digest)||!hash(imported.result_digest)||!hash(imported.parser_digest)||proof.statementFileDigest!==imported.file_digest||proof.statementResultDigest!==imported.result_digest||proof.statementParserDigest!==imported.parser_digest||proof.source!=='statement'||proof.matcher!=='protected-statement-match'||proof.accountScopeVerified!==true)fail();
  // Never accept a claim that it is authoritative solely because it says so.
  const attestation=await this.attestation(receipt,{mapping:immutable(structuredClone(mapping)),request});
  this.validateAttestation(attestation,receipt,request,mapping);
  const current=await this.resolve(request);if(digest(current)!==digest(mapping))fail();
  const accepted=immutable({...proof,provenance:{sourceId:this.sourceId,mappingId:mapping.id,mappingVersion:mapping.version,attestationId:attestation.id,receiptDigest:digest(receipt),economicId:proof.economicId,checkedAt:this.clock()}});
  this.accepted.set(accepted,{request,mapping:structuredClone(mapping),receipt:structuredClone(receipt),attestation:structuredClone(attestation)});return accepted;
 }
 validateAttestation(a,receipt,request,mapping){
  const now=this.clock();
  if(!a||!id(a.id)||a.authenticated!==true||a.independent!==true||a.revoked!==false||a.sourceId!==this.sourceId||a.sourceAccountId!==mapping.sourceAccountId||a.tenantId!==mapping.tenantId||a.merchantTenantId!==mapping.merchantTenantId||a.mappingId!==mapping.id||a.mappingVersion!==mapping.version||a.receiptDigest!==digest(receipt)||a.economicId!==receipt.proof.economicId||a.requestDigest!==digest(request)||!Number.isFinite(a.checkedAt)||a.checkedAt>now||now-a.checkedAt>this.maxAgeMs||!Number.isFinite(a.validUntil)||a.validUntil<=now||a.synthetic===true&&!this.allowSynthetic)fail();
 }
 async beforePosting(client,proof){
  const accepted=this.accepted.get(proof);if(!accepted)fail();
  const {request,mapping,receipt}=accepted,current=await this.resolve(request,client);
  if(digest(current)!==digest(mapping))fail();
  const a=await this.attestation(receipt,{mapping:immutable(structuredClone(current)),request,client});
  this.validateAttestation(a,receipt,request,current);
  if(a.id!==accepted.attestation.id)fail();
  // The caller posts within this same transaction. Audit contains digests and
  // provenance only, never raw statement contents or the banking OTP/UTR.
  return proof.provenance;
 }
}
module.exports={AuthoritativeStatementSource};

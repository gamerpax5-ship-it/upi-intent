"use strict";
const {AuthError}=require('../auth/runtime/errors'),{validateEvidence}=require('../gateway/evidence');
// The global legacy matcher is deliberately not invoked against a shared source.
// An authoritative source connector must establish the account/version boundary
// independently, and report a result of the protected matcher within that scope.
// Upload metadata, a UTR claim and a legacy "matched" flag are never authority.
class StatementEvidence {
 constructor({pool,lookup=null,allowSynthetic=false}){this.pool=pool;this.lookup=lookup;this.allowSynthetic=allowSynthetic;}
 async verify(snapshot){
  if(typeof this.lookup!=='function')return null;
  const imports=(await this.pool.query(`SELECT i.id,i.file_digest,i.result_digest,i.parser_digest,i.bank_id,i.bank_version,i.owner_id
   FROM wpay_auth.bank_statement_imports i JOIN wpay_auth.business_bank_accounts b ON b.id=i.bank_id
   WHERE i.owner_id=$1 AND i.bank_id=$2 AND i.bank_version=$3 AND b.owner_id=i.owner_id AND b.version=i.bank_version
   AND i.status='accepted' ORDER BY i.created_at DESC,i.id LIMIT 100`,[snapshot.userId,snapshot.bankId,snapshot.bankVersion])).rows;
  if(!imports.length)return null;
  const proof=await this.lookup(Object.freeze({...snapshot,imports:Object.freeze(imports.map(i=>Object.freeze({...i})))}));
  if(!proof)return null;const imported=imports.find(i=>i.id===proof.statementImportId);
  if(!imported||proof.statementFileDigest!==imported.file_digest||proof.statementResultDigest!==imported.result_digest||proof.accountScopeVerified!==true||proof.matcher!=='protected-statement-match'||proof.source!=='statement')throw new AuthError('FORBIDDEN');
  validateEvidence(snapshot,proof,this.allowSynthetic);return proof;
 }
}
module.exports={StatementEvidence};

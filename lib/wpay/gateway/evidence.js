"use strict";
const {AuthError}=require('../auth/runtime/errors');
// PaymentEvidenceVerifier is injected by server composition, never an HTTP body.
// Legacy observations alone do not satisfy this contract.
function validateObservation(snapshot,proof,allowSynthetic=false){
 const deny=()=>{throw new AuthError('FORBIDDEN');};
 if(!proof||proof.synthetic===true&&!allowSynthetic)deny();
 for(const field of ['orderId','reservationId','merchantId','userId','bankId','bankVersion','upi','accountDigest','amountMinor','currency','createdAt','expiresAt'])if(proof[field]!==snapshot[field])deny();
 return proof;
}
function validateEvidence(snapshot,proof,allowSynthetic=false){
 const deny=()=>{throw new AuthError('FORBIDDEN');};
 if(!proof||proof.verified!==true||proof.final!==true||proof.synthetic===true&&!allowSynthetic||!['confirmed','failed'].includes(proof.status)||!['normal','statement','recovery'].includes(proof.source))deny();
 validateObservation(snapshot,proof,allowSynthetic);
 if(typeof proof.evidenceId!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(proof.evidenceId)||typeof proof.economicId!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(proof.economicId)||! /^[0-9]{12}$/.test(proof.utr))deny();
 const received=Date.parse(proof.receivedAt);if(!Number.isFinite(received)||received<Date.parse(snapshot.createdAt)||received>Date.now()+30000)deny();
 // A trusted late receipt may exceed expiry, but must still bind the original window.
 return proof;
}
module.exports={validateEvidence,validateObservation};

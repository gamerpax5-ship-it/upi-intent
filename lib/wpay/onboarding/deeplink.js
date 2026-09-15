"use strict";
const Upi=require('../../../public/upi');
const {load}=require('../auth/runtime/dependencies');
const {AuthError}=require('../auth/runtime/errors');
async function verificationQr(challenge,bank){
 if(challenge.owner_id!==bank.owner_id||challenge.bank_id!==bank.id||challenge.bank_version!==bank.version||challenge.expected_upi!==bank.details.upiId)throw new AuthError('FORBIDDEN');
 const amount=(BigInt(challenge.amount_minor)/100n).toString()+'.'+(BigInt(challenge.amount_minor)%100n).toString().padStart(2,'0');
 // Existing protected construction/escaping and field handling, used unchanged.
 const uri=Upi.manual(bank.details.upiId,bank.details.holderName,amount,'WPay verification '+challenge.id);
 const parsed=Upi.parse(uri);if(parsed.fields.pa[0]!==challenge.expected_upi||parsed.fields.am[0]!==amount||parsed.fields.cu[0]!=='INR')throw new AuthError('UNAVAILABLE');
 return {uri,qr:await load().qr.toDataURL(uri,{errorCorrectionLevel:'M',width:256,margin:2}),amount};
}
module.exports={verificationQr};

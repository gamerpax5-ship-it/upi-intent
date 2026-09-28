'use strict';
// Presentation-only redaction. Does not change collection, storage or pairing.
function maskedContent(event){
 const n=Number(event.otp_length),length=Number.isInteger(n)&&n>=4&&n<=8?n:6;
 const code='12345678'.slice(0,length),source=typeof event.code==='string'?event.code.trim():'';
 const text=typeof event.message==='string'?event.message.trim().slice(0,4000):'';
 // Legacy rows cannot be assumed to contain already-redacted text. If there is
 // no identifiable token to remove, hide the message rather than forward it.
 if(!text)return {code,message:null,masked:true};
 if(!/^[\p{L}\p{N}]{4,12}$/u.test(source)||!text.includes(source))return {code,message:'[Masked message]',masked:true};
 const message=text.split(source).join(code)
  .replace(/https?:\/\/\S+/giu,'[Masked link]')
  .replace(/[\p{L}\p{N}]*\p{N}[\p{L}\p{N}]*/gu,code);
 return {code,message,masked:true};
}
module.exports={maskedContent};

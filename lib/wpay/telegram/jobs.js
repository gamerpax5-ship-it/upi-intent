'use strict';
const known=new Set(['DEVICE_NUMBER_NOT_FOUND','AMBIGUOUS_DEVICE_NUMBER','DEVICE_SOURCE_UNAVAILABLE','MASKED_EVENT_SOURCE_UNAVAILABLE','UTR_SOURCE_UNAVAILABLE','OTP_SOURCE_UNAVAILABLE','VERIFIED_UPI_SOURCE_MAPPING_REQUIRED','TELEGRAM_TENANT_SCOPE_REQUIRED']);
async function processJob({job,bot,store,onError}){
 await store.attempt(job.update_id);
 try{
  try{await bot.command(job.message,job.update_id);}
  catch(error){
   const code=known.has(error.code)?error.code:error.message;
   if(!known.has(code))throw error;
   // A failed error reply is still an undelivered command, not a success.
   await bot.send(job.message.chat,code.replaceAll('_',' '));
  }
  await store.markProcessed(job.update_id);
 }catch{
  onError(Number(job.attempts)>=4?'TELEGRAM_COMMAND_EXHAUSTED':'TELEGRAM_COMMAND_FAILED');
 }
}
module.exports={processJob};

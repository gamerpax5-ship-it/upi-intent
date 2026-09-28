'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{processJob}=require('../lib/wpay/telegram/jobs');
test('failed command error delivery remains unprocessed and exhausted retries log no private data',async()=>{
 let processed=0,attempts=0;const errors=[],job={update_id:1,attempts:0,message:{chat:{id:-123}}};
 const bot={command:async()=>{throw Error('DEVICE_NUMBER_NOT_FOUND');},send:async()=>{throw Error('secret-token-url');}};
 const store={attempt:async()=>attempts++,markProcessed:async()=>processed++};
 await processJob({job,bot,store,onError:c=>errors.push(c)});assert.equal(processed,0);assert.equal(attempts,1);
 await processJob({job:{...job,attempts:4},bot,store,onError:c=>errors.push(c)});
 assert.deepEqual(errors,['TELEGRAM_COMMAND_FAILED','TELEGRAM_COMMAND_EXHAUSTED']);
 bot.send=async()=>{};await processJob({job,bot,store,onError:c=>errors.push(c)});assert.equal(processed,1);
});
test('known typed source errors use sanitized code and successful jobs are acknowledged',async()=>{
 const replies=[];let processed=0;const job={update_id:1,attempts:0,message:{chat:{id:-123}}};
 const bot={command:async()=>{throw Object.assign(Error('private diagnostic'),{code:'OTP_SOURCE_UNAVAILABLE'});},send:async(c,text)=>replies.push(text)};
 const store={attempt:async()=>{},markProcessed:async()=>processed++},onError=()=>assert.fail('Unexpected failure');
 await processJob({job,bot,store,onError});assert.deepEqual(replies,['OTP SOURCE UNAVAILABLE']);assert.equal(processed,1);
 bot.command=async()=>{};await processJob({job,bot,store,onError});assert.equal(processed,2);
});

"use strict";
const {FundingProvider,TOPIC}=require('../../lib/wpay/funding/provider'),net=require('../../lib/wpay/funding/networks');
function providerFixture(snapshot,claim,options={}){
 const block='ab'.repeat(32),topicAddress=value=>'0x'+'0'.repeat(24)+net.evmAddress(snapshot.network,value);
 const log={address:net.evmAddress(snapshot.network,snapshot.token),topics:['0x'+TOPIC,topicAddress(snapshot.address),topicAddress(snapshot.address)],data:BigInt(snapshot.amountMinor).toString(16).padStart(64,'0'),logIndex:'0x'+claim.event_index.toString(16),transactionHash:claim.tx_hash,blockHash:'0x'+block,blockNumber:'0x64',removed:false,...options.log};
 const requests=[];const fetcher=async(url,init)=>{requests.push({url,body:JSON.parse(init.body),redirect:init.redirect});const b=JSON.parse(init.body);let result;
  if(b.method==='eth_chainId')result=options.chainId||net.network(snapshot.network).chainId;
  else if(b.method==='eth_getTransactionReceipt')result=options.pending?null:{transactionHash:claim.tx_hash,status:options.failed?'0x0':'0x1',logs:options.logs||[log],blockHash:'0x'+block,blockNumber:'0x64'};
  else if(b.method==='eth_getBlockByNumber')result={number:b.params[0]==='finalized'?(options.confirming?'0x64':'0x80'):'0x64',hash:'0x'+(options.reorg?'cd'.repeat(32):block),timestamp:'0x'+Math.floor((options.time||Date.now()+5000)/1000).toString(16)};
  else if(url.endsWith('gettransactioninfobyid'))result=options.pending?{}:{id:claim.tx_hash,receipt:{result:options.failed?'FAILED':'SUCCESS'},blockNumber:100,blockTimeStamp:options.time||Date.now()+5000,log:options.logs||[log]};
  else if(url.endsWith('getblockbynum'))result={blockID:options.reorg?'cd'.repeat(32):block,block_header:{raw_data:{number:100}},transactions:[{txID:claim.tx_hash}]};
  else if(url.endsWith('getnowblock'))result={block_header:{raw_data:{number:options.confirming?99:110}}};
  else throw Error('Unexpected provider request');
  return new Response(JSON.stringify(b.method?{jsonrpc:'2.0',id:1,result}:result),{status:200});
 };
 return {provider:new FundingProvider({ethereumUrl:'https://rpc.example.invalid/',tronOrigin:'https://api.trongrid.io/',fetcher}),requests,log,block};
}
module.exports={providerFixture};

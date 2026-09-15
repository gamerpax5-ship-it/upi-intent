"use strict";
const {network,hash,transferKey,evmAddress}=require('./networks');
const TOPIC='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const validHex=(value,bytes)=>typeof value==='string'&&new RegExp('^[0-9a-f]{'+bytes*2+'}$').test(value);
const unhex=value=>typeof value==='string'?value.replace(/^0x/,'').toLowerCase():'';
const quantity=value=>{if(typeof value!=='string'||!/^0x[0-9a-f]+$/.test(value))throw Error('invalid_provider_data');return BigInt(value);};
function transfer(snapshot,claim,log){
 const n=network(snapshot.network),topics=log?.topics?.map(unhex);if(unhex(log?.address)!==evmAddress(snapshot.network,n.token)||!topics||topics.length!==3||topics[0]!==TOPIC||!topics.slice(1).every(x=>validHex(x,32)&&x.startsWith('0'.repeat(24)))||!validHex(unhex(log.data),32))return {state:'review',reason:'Wrong token or malformed transfer event'};
 const recipient=topics[2].slice(24),amount=BigInt('0x'+unhex(log.data)).toString();if(recipient!==evmAddress(snapshot.network,snapshot.address))return {state:'review',reason:'Wrong receiving address'};
 return {transferKey:transferKey(snapshot.network,claim.tx_hash,claim.event_index),network:snapshot.network,token:n.token,recipient:snapshot.address,amountMinor:amount,txHash:claim.tx_hash,eventIndex:claim.event_index};
}
// Uses only fixed operator configuration. No URL/header is accepted from an HTTP client.
class FundingProvider {
 constructor({ethereumUrl=null,tronOrigin=null,ethereumKey=null,tronKey=null,fetcher=fetch}={}){this.fetcher=fetcher;this.config={};for(const [name,url,key]of [['ETHEREUM-ERC20',ethereumUrl,ethereumKey],['TRON-TRC20',tronOrigin,tronKey]])if(url){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('Invalid funding provider configuration');if(name==='TRON-TRC20'&&(u.pathname!=='/'||u.origin!=='https://api.trongrid.io'))throw Error('TRON provider must be the configured mainnet origin');this.config[name]={url:u.toString(),key};}}
 configured(name){return !!this.config[name];}
 async json(name,path,body){const c=this.config[name];if(!c)throw Error('source_not_configured');const url=path?new URL(path,c.url).toString():c.url;const response=await this.fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json',...(c.key?{[name==='TRON-TRC20'?'TRON-PRO-API-KEY':'authorization']:name==='TRON-TRC20'?c.key:'Bearer '+c.key}:{})},body:JSON.stringify(body)});if(!response.ok)throw Error('provider_unavailable');const reader=response.body.getReader();let bytes=0,parts=[];try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>1048576)throw Error('provider_response_limit');parts.push(Buffer.from(chunk.value));}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(Buffer.concat(parts).toString());}
 async rpc(name,method,params){const response=await this.json(name,name==='TRON-TRC20'?'/jsonrpc':'',{jsonrpc:'2.0',id:1,method,params});if(response.error||response.id!==1)throw Error('provider_unavailable');return response.result;}
 async verify(snapshot,claim,previousBlock=null){
  if(!this.configured(snapshot.network))return {state:'review',reason:'Verification source not configured'};
  try{hash(snapshot.network,claim.tx_hash);const n=network(snapshot.network);if(snapshot.token!==n.token||snapshot.decimals!==6)return {state:'review',reason:'Wrong configured token'};
   if(await this.rpc(snapshot.network,'eth_chainId',[])!==n.chainId)return {state:'review',reason:'Wrong provider network'};
   if(snapshot.network==='ETHEREUM-ERC20')return await this.ethereum(snapshot,claim,previousBlock);
   return await this.tron(snapshot,claim,previousBlock);
  }catch{return {state:'waiting',reason:'Verification provider unavailable or invalid response'};}
 }
 async ethereum(s,c,previousBlock){const receipt=await this.rpc(s.network,'eth_getTransactionReceipt',[c.tx_hash]);if(!receipt)return {state:'detected',reason:'Transfer receipt not yet available'};
  if(receipt.transactionHash!==c.tx_hash||receipt.status!=='0x1')return {state:'review',reason:'Failed or mismatched transaction receipt'};
  const logs=receipt.logs;if(!Array.isArray(logs)||logs.length>10000)return {state:'review',reason:'Invalid receipt logs'};const found=logs.filter(l=>quantity(l.logIndex)===BigInt(c.event_index));if(found.length!==1)return {state:'review',reason:'Transfer event index not found or ambiguous'};
  const log=found[0];if(log.transactionHash!==c.tx_hash||log.blockHash!==receipt.blockHash||log.blockNumber!==receipt.blockNumber||log.removed===true)return {state:'review',reason:'Removed or mismatched transfer log'};const evidence=transfer(s,c,log);if(evidence.state)return evidence;
  const canonical=await this.rpc(s.network,'eth_getBlockByNumber',[receipt.blockNumber,false]);if(!canonical||!validHex(unhex(receipt.blockHash),32)||!validHex(unhex(canonical.hash),32)||canonical.number!==receipt.blockNumber)return {state:'waiting',reason:'Canonical block evidence unavailable'};
  if(canonical.hash!==receipt.blockHash||(previousBlock&&canonical.hash!==previousBlock))return {state:'reorg',reason:'Canonical block changed',...evidence};
  const finalized=await this.rpc(s.network,'eth_getBlockByNumber',['finalized',false]);if(!finalized)return {state:'confirming',reason:'Finalized block unavailable',...evidence};const confirmations=quantity(finalized.number)-quantity(receipt.blockNumber)+1n;
  return {...evidence,state:confirmations>=BigInt(network(s.network).confirmations)?'verified':'confirming',reason:confirmations>=12n?'Finalized ERC-20 transfer':'Waiting for finality',blockHash:receipt.blockHash,blockNumber:quantity(receipt.blockNumber).toString(),blockTime:new Date(Number(quantity(canonical.timestamp))*1000).toISOString(),confirmations:confirmations>0n?confirmations.toString():'0',finality:'finalized'};
 }
 async tron(s,c,previousBlock){const receipt=await this.json(s.network,'/walletsolidity/gettransactioninfobyid',{value:c.tx_hash});if(!receipt?.id)return {state:'confirming',reason:'Solidified transfer receipt not yet available'};
  if(receipt.id!==c.tx_hash||receipt.receipt?.result!=='SUCCESS'||receipt.result==='FAILED'||!Number.isSafeInteger(receipt.blockNumber))return {state:'review',reason:'Failed or mismatched transaction receipt'};
  if(!Array.isArray(receipt.log)||receipt.log.length>10000||!receipt.log[c.event_index])return {state:'review',reason:'Transfer event index not found'};const evidence=transfer(s,c,receipt.log[c.event_index]);if(evidence.state)return evidence;
  const block=await this.json(s.network,'/walletsolidity/getblockbynum',{num:receipt.blockNumber}),head=await this.json(s.network,'/walletsolidity/getnowblock',{});
  if(!validHex(block.blockID,32)||block.block_header?.raw_data?.number!==receipt.blockNumber||!block.transactions?.some(t=>t.txID===c.tx_hash))return {state:'review',reason:'Transaction not bound to solidified block'};
  if(previousBlock&&block.blockID!==previousBlock)return {...evidence,state:'reorg',reason:'Solidified block changed'};const h=head.block_header?.raw_data?.number;if(!Number.isSafeInteger(h)||h<receipt.blockNumber)return {...evidence,state:'confirming',reason:'Waiting for solidified height'};
  return {...evidence,state:'verified',reason:'Solidified TRC-20 transfer',blockHash:block.blockID,blockNumber:String(receipt.blockNumber),blockTime:new Date(receipt.blockTimeStamp).toISOString(),confirmations:String(h-receipt.blockNumber+1),finality:'solidified'};
 }
}
function fromEnvironment(env=process.env){return new FundingProvider({ethereumUrl:env.WPAY_FUNDING_ETHEREUM_RPC_URL,tronOrigin:env.WPAY_FUNDING_TRON_ORIGIN,ethereumKey:env.WPAY_FUNDING_ETHEREUM_API_KEY,tronKey:env.WPAY_FUNDING_TRON_API_KEY});}
module.exports={FundingProvider,fromEnvironment,TOPIC,transfer};

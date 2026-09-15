"use strict";
const crypto=require('node:crypto'),dns=require('node:dns/promises'),https=require('node:https'),http=require('node:http'),ipaddr=require('ipaddr.js');
const {AuthError}=require('../auth/runtime/errors');
const denied=()=>{throw new AuthError('INVALID_INPUT');};
function signature(secret,timestamp,eventId,body){return crypto.createHmac('sha256',secret).update(`${timestamp}.${eventId}.${body}`).digest('hex');}
function verifySignature(secret,headers,body,now=Date.now()){
 const time=headers['x-wpay-timestamp'],id=headers['x-wpay-event-id'],sig=headers['x-wpay-signature'];
 if(!/^\d{10}$/.test(time||'')||Math.abs(now/1000-Number(time))>300||!/^v1=[a-f0-9]{64}$/.test(sig||'')||typeof id!=='string'||id.length>100)return false;
 return crypto.timingSafeEqual(Buffer.from(signature(secret,time,id,body),'hex'),Buffer.from(sig.slice(3),'hex'));
}
function publicIP(address){try{let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();return ip.range()==='unicast';}catch{return false;}}
function endpoint(raw,{testCallback=null}={}){
 if(typeof raw!=='string'||raw.length>2048)denied();let u;try{u=new URL(raw);}catch{denied();}
 if(u.username||u.password||u.hash||u.search||u.hostname.endsWith('.')||u.href!==raw)denied();
 const test=testCallback!==null&&u.href===testCallback&&u.protocol==='http:'&&u.hostname==='127.0.0.1';
 if(!test&&(u.protocol!=='https:'||(u.port&&u.port!=='443')))denied();
 const host=u.hostname.replace(/^\[|\]$/g,'');if(!test&&ipaddr.isValid(host)&&!publicIP(host))denied();
 return {u,test,host};
}
async function destination(raw,options={}){
 const result=endpoint(raw,options);let timer;
 const addresses=await Promise.race([(options.lookup||dns.lookup)(result.host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AuthError('UNAVAILABLE')),3000);})]).finally(()=>clearTimeout(timer));
 if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!ipaddr.isValid(a.address)||(!result.test&&!publicIP(a.address))||(result.test&&a.address!=='127.0.0.1')))denied();
 return {...result,address:addresses[0]};
}
async function deliver(raw,body,headers,options={}){
 const {u,test,address}=await destination(raw,options);
 return new Promise(resolve=>{
  const request=(test?http:https).request(u,{method:'POST',agent:false,lookup:(_host,opts,cb)=>cb(null,opts.all?[address]:address.address,address.family),headers:{...headers,'content-type':'application/json','content-length':Buffer.byteLength(body)},timeout:5000},response=>{
   // Never follow redirects. Discard response content without storing/logging it.
   let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>16384)response.destroy();});
   response.on('end',()=>resolve(response.statusCode));response.on('error',()=>resolve(0));response.on('close',()=>resolve(0));
  });const deadline=setTimeout(()=>request.destroy(),8000);request.on('close',()=>clearTimeout(deadline));request.on('timeout',()=>request.destroy());request.on('error',()=>resolve(0));request.end(body);
 });
}
module.exports={signature,verifySignature,publicIP,endpoint,destination,deliver};

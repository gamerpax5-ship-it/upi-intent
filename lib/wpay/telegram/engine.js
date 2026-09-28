'use strict';
const {parse,subscription,watchesPhone}=require('./commands'),format=require('./format');
const {HELP}=require('./catalog');
class Bot{
 constructor({telegram,access,store,source,username,onError=()=>{}}){Object.assign(this,{telegram,access,store,source,username,onError});}
 async send(chat,text){if(!await this.access.allowed(chat))throw Error('GROUP_ACCESS_DENIED');return this.telegram.text(chat.id,text);}
 async sendUtr(chat,text,actorId){if(!await this.access.allowedUtr(chat,actorId))throw Error('GROUP_ACCESS_DENIED');return this.telegram.text(chat.id,text);}
 async command(message,updateId){
  if(!message?.from||message.from.is_bot||message.sender_chat)return;
  let input;try{input=parse(message.text,this.username);}catch{if(await this.access.allowed(message.chat,message.from.id))await this.send(message.chat,'Invalid command argument.\n'+HELP);return;}
  if(!input)return;
  const utrCommand=['creditutr','creditutrall'].includes(input.command);
  if(!await (utrCommand?this.access.allowedUtr(message.chat,message.from.id):this.access.allowed(message.chat,message.from.id)))return;
  await this.store.exclusive(message.chat.id,async state=>{
   if(await this.store.processed(updateId))return;
   const chat=message.chat;
   if(['start','help'].includes(input.command)){await this.send(chat,HELP);}
   else if(input.command==='stopall'){await this.store.save(chat,{...subscription(null,{command:'disconnect',all:true}),since:new Date().toISOString()});await this.send(chat,'All group streams stopped.');}
   else if(['connect','connectall','disconnect','devicehistoryall','creditutrall'].includes(input.command)){
    if(input.phone&&input.command==='connect')await this.source.device(input.phone);
    if(input.command==='creditutrall'){const probe=this.source.utrs(input.upi||null);try{await probe.next();}finally{await probe.return();}}
    const now=new Date().toISOString(),next=subscription(state,input);next.since=state?.since||now;
    if(input.command==='connect')next.phoneSince={...state?.phoneSince,[input.phone]:now};
    if(input.command==='connectall'){next.otpSince=now;next.phoneSince={};}
    if(input.command==='devicehistoryall')next.historySince=now;
    if(input.command==='creditutrall'){next.utrSince=null;next.utrFilter=input.upi||null;next.utrRunId=String(updateId);next.utrActor=String(message.from.id);delete next.utrQuery;delete next.utrQueryId;}
    await this.store.save(chat,next);
    if(input.command==='creditutrall')await this.sendUtr(chat,'Available UTR history queued'+(input.upi?' for '+input.upi:' for all verified UPIs')+'. New matching credits will follow in batches; /stopall stops delivery.',message.from.id);
    else await this.send(chat,input.command==='disconnect'?'Masked OTP notifications disconnected.':'Subscription saved. Only new events will be sent. OTP codes and SMS bodies are never forwarded.');
   }else if(input.command==='status')await this.send(chat,format.status(await this.source.device(input.phone)));
   else if(input.command==='location'){
    const d=await this.source.device(input.phone),point=format.location(d);
    if(!point)await this.send(chat,'Location unavailable: the device has not supplied a valid permitted location.');
    else{await this.send(chat,`Number: ${input.phone}\nLast reported location: ${format.time(point.at)}\nThis is not a freshly requested GPS fix.`);if(await this.access.allowed(chat))await this.telegram.call('sendLocation',{chat_id:chat.id,latitude:point.latitude,longitude:point.longitude});}
   }else if(input.command==='devicehistory'){
    const events=await this.source.history(input.phone);for(const page of events)await this.send(chat,page);
   }else if(input.command==='creditutr'){
    const probe=this.source.utrs(input.upi);try{await probe.next();}finally{await probe.return();}
    await this.store.save(chat,{...subscription(state,{}),utrAll:false,utrActor:String(message.from.id),utrFilter:input.upi,utrQuery:input.upi,utrQueryId:String(updateId),since:state?.since||new Date().toISOString()});
    await this.sendUtr(chat,'UPI credit history queued. Results arrive in batches; /stopall cancels streams.',message.from.id);
   }
   await this.store.markProcessed(updateId);
  });
 }
 async tick(){
  for(const group of await this.store.groups()){
   const normalAllowed=await this.access.allowed(group.chat);
   if(!normalAllowed&&!await this.access.allowedUtr?.(group.chat))continue;
   await this.store.exclusive(group.chat.id,async state=>{
    const counts={};const deliver=async(kind,event,text)=>{
     if(await this.store.delivered(group.chat.id,kind,event.id))return;
     if(kind==='utr'){
      if(!state.utrActor||!await this.access.allowedUtr(group.chat,state.utrActor))throw Error('GROUP_ACCESS_DENIED');
      await this.sendUtr(group.chat,text,state.utrActor);
     }else await this.send(group.chat,text);
     await this.store.markDelivered(group.chat.id,kind,event.id);counts[kind]=(counts[kind]||0)+1;if(counts[kind]>=5)throw Error('BOT_BATCH_COMPLETE');
    };
    const stream=async fn=>{try{await fn();}catch(e){if(e.message!=='BOT_BATCH_COMPLETE')this.onError('TELEGRAM_STREAM_FAILED');}};
    if(normalAllowed&&(state.otpAll||state.phones?.length))await stream(async()=>{for await(const event of this.source.events(state.since,{includeMaskedContent:true})){
     const selected=[...new Set(event.phones||[event.phone])].filter(number=>watchesPhone(state,number)&&+new Date(event.receivedAt)>=+new Date(state.phoneSince?.[number]||state.otpSince||state.since));
     // One delivery per device event; show only the subscribed phone selectors.
     if(selected.length)await deliver('otp',event,format.maskedEvent({...event,phone:selected.join(', ')}));
    }});
    if(normalAllowed&&state.historyAll)await stream(async()=>{for await(const event of this.source.historyEvents(state.historySince||state.since))await deliver('history',event,event.text);});
    const utrAllowed=state.utrActor&&await this.access.allowedUtr(group.chat,state.utrActor);
    if(utrAllowed&&state.utrQuery)await stream(async()=>{for await(const event of this.source.utrs(state.utrQuery))await deliver('utr',{...event,id:`query:${state.utrQueryId}:${event.id}`},format.utr(event));const next={...state};delete next.utrQuery;delete next.utrQueryId;await this.store.save(group.chat,next);});
    if(utrAllowed&&state.utrAll)await stream(async()=>{for await(const event of this.source.utrs(state.utrFilter||null,state.utrRunId?undefined:state.utrSince||state.since))await deliver('utr',state.utrRunId?{...event,id:`all:${state.utrRunId}:${event.id}`}:event,format.utr(event));});
   }).catch(()=>this.onError('TELEGRAM_GROUP_FAILED'));
  }
 }
}
module.exports={Bot,HELP};

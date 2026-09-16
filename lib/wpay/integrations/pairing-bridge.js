"use strict";
const {AuthError}=require('../auth/runtime/errors');
// Exactly two existing legacy routes. This is not a general-purpose Admin proxy.
class PairingBridge{
 constructor({origin,username,password,local=false}){
  const u=new URL(origin);if(u.origin!==origin||u.username||u.password||(!local&&u.protocol!=='https:')||(local&&(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)))||!username||!password)throw new AuthError('UNAVAILABLE');
  this.origin=origin;this.username=username;this.password=password;
 }
 async issue(){
  try{
   const login=await fetch(this.origin+'/api/dashboard/login',{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json'},body:JSON.stringify({username:this.username,password:this.password})});
   if(!login.ok)throw 0;const cookie=login.headers.getSetCookie().find(v=>v.startsWith('wpay_dashboard_session='))?.split(';')[0];if(!cookie)throw 0;
   const issued=await fetch(this.origin+'/api/devices/admin/pairing-token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json',cookie},body:'{}'});if(!issued.ok)throw 0;
   const body=await issued.json();if(!/^[A-Z2-9]{8}$/.test(body.pairingCode)||body.expiresInSeconds!==600)throw 0;return body.pairingCode;
  }catch{throw new AuthError('OTP_SOURCE_UNAVAILABLE');}
 }
}
function configuredPairingBridge(env=process.env){if(!env.WPAY_LEGACY_PAIRING_ORIGIN)return null;return new PairingBridge({origin:env.WPAY_LEGACY_PAIRING_ORIGIN,username:env.WPAY_LEGACY_PAIRING_USERNAME,password:env.WPAY_LEGACY_PAIRING_PASSWORD,local:env.WPAY_LEGACY_PAIRING_LOCAL==='isolated-loopback'});}
module.exports={PairingBridge,configuredPairingBridge};

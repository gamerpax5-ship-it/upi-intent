"use strict";
const assert=require('node:assert/strict'),express=require('express'),{Pool}=require('pg'),{randomBytes}=require('node:crypto');
const {initDeviceTables,createDeviceRouter}=require('../../lib/device-pairing'),{initDeviceOtpTables,createDeviceOtpRouter}=require('../../lib/device-otp-router'),{requireDashboard,loginHandler}=require('../../lib/dashboard-auth');
const {OperationalSource}=require('../../lib/wpay/integrations/operational-source'),{PairingBridge}=require('../../lib/wpay/integrations/pairing-bridge');
async function sourceFixture(t,cfg){
 for(const c of [cfg.legacyOwner,cfg.operationalReader]){assert.equal(c.host,'127.0.0.1');assert.match(c.database,/^wpay_12_source_(\d{3}|ci)$/);}
 const owner=new Pool(cfg.legacyOwner),reader=new Pool(cfg.operationalReader);t.after(async()=>{await reader.end();await owner.end();});assert.equal((await owner.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount,0);
 await initDeviceTables(owner);await initDeviceOtpTables(owner);
 await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');await owner.query('GRANT USAGE ON SCHEMA public TO wpay_operational_reader');
 await owner.query('GRANT SELECT(id,status,app_version,last_seen_at) ON public.devices TO wpay_operational_reader');
 await owner.query('GRANT SELECT(id,token_hash,status,device_id,created_at,expires_at,claimed_at) ON public.device_pairings TO wpay_operational_reader');
 await owner.query('GRANT SELECT(id,device_id,sender,code_mask,otp_length,message_masked,source,sms_received_at,created_at) ON public.device_otp_events TO wpay_operational_reader');
 const env={NODE_ENV:'development',DASHBOARD_USERNAME:'synthetic-owner',DASHBOARD_PASSWORD:randomBytes(24).toString('base64url'),DASHBOARD_SESSION_SECRET:randomBytes(32).toString('base64url')};
 const app=express();app.use(express.json());app.post('/api/dashboard/login',loginHandler(env));app.use('/api/devices/admin',requireDashboard(env));app.use('/api/devices',createDeviceRouter({pool:owner,env}));app.use('/api/devices',createDeviceOtpRouter({pool:owner}));app.use((err,req,res,next)=>{void err;void req;void next;res.status(500).json({error:'Synthetic source unavailable'});});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const origin='http://127.0.0.1:'+server.address().port;
 const source=new OperationalSource(reader),bridge=new PairingBridge({origin,username:env.DASHBOARD_USERNAME,password:env.DASHBOARD_PASSWORD,local:true});
 async function pair(code,deviceId){const sim='synthetic-sim-'+deviceId,response=await fetch(origin+'/api/devices/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pairingCode:code,deviceId,simFingerprint:sim,appVersion:'synthetic-test'})});assert.equal(response.status,201);return {...await response.json(),sim};}
 async function otp(device,code){const response=await fetch(origin+'/api/devices/otp-event',{method:'POST',headers:{'content-type':'application/json','x-device-id':device.deviceId,authorization:'Bearer '+device.deviceToken},body:JSON.stringify({simFingerprint:device.sim,otpCode:code,messageMasked:'Synthetic banking OTP '+code,sender:'TEST-BANK',receivedAt:new Date().toISOString()})});assert.equal(response.status,201);return response.json();}
 return {source,bridge,pair,otp,owner,reader,origin};
}
module.exports={sourceFixture};

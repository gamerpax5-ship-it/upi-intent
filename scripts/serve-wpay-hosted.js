"use strict";
const { createHostedPool,verifyRuntimeRole } = require("../lib/wpay/db/hosted-config");
const { validateMigrations } = require("../lib/wpay/db/migrations");
const { SecurityRepository } = require("../lib/wpay/db/security-repository");
const { MfaCrypto,readKey } = require("../lib/wpay/auth/runtime/mfa");
const { fromEnvironment } = require("../lib/wpay/funding/provider");
const { openLegacySource } = require("../lib/wpay/integrations/source-config");
const {openOperationalSource}=require('../lib/wpay/integrations/operational-source');
const {configuredPairingBridge}=require('../lib/wpay/integrations/pairing-bridge');
const { AuthService } = require("../lib/wpay/auth/runtime/service");
const { startAuthServer } = require("../lib/wpay/auth/runtime/http");
const { transport } = require("../lib/wpay/auth/runtime/transport");
async function main(){
  if(process.argv.length!==2 || process.env.NODE_ENV!=="production" || !/^[1-9][0-9]{0,4}$/.test(process.env.PORT||"") || Number(process.env.PORT)>65535)throw Error();
  const policy=transport(process.env.WPAY_HOSTED_ORIGIN);if(!policy.secure)throw Error();
  const mfaCrypto=new MfaCrypto(readKey({WPAY_AUTH_DEV_MFA_KEY:process.env.WPAY_HOSTED_MFA_KEY}),{issuer:"WPay"});mfaCrypto.libraries();
  const pool=createHostedPool();let stopping=false,source,operational;
  try {
    await verifyRuntimeRole(pool);await validateMigrations(pool);
    const factors=await pool.query("SELECT account_id,factor_version,encrypted_secret FROM wpay_auth.account_security WHERE enabled=true");
    for(const factor of factors.rows)mfaCrypto.open(factor.encrypted_secret,`wpay-factor:${factor.account_id}:${factor.factor_version}`);
    source=openLegacySource();operational=openOperationalSource();const pairingBridge=configuredPairingBridge();
    const server=await startAuthServer({service:new AuthService(new SecurityRepository(pool,{throttleMode:"hosted"}),{mfaCrypto,legacyReader:source.reader,operationalSource:operational.source,pairingBridge,fundingProvider:fromEnvironment(),fixedCurrency:process.env.WPAY_HOSTED_FIXED_FEE_CURRENCY}),
      port:Number(process.env.PORT),hostedOrigin:policy.origin,readiness:async()=>{
        if(stopping)return false;
        try {await pool.query("SELECT 1");return true;}catch{return false;}
      }});
    const stop=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>server.closeAllConnections(),10000);deadline.unref();server.close(()=>{clearTimeout(deadline);pool.end().catch(()=>{});source.close().catch(()=>{});operational.close().catch(()=>{});});server.closeIdleConnections();};
    process.once("SIGTERM",stop);process.once("SIGINT",stop);
    console.log("WPay hosted authentication listening; legacy observations require an independently verified owner mapping and an available read-only source.");
    return server;
  }catch(error){await pool.end();if(source)await source.close();if(operational)await operational.close();throw error;}
}
if(require.main===module)main().catch(()=>{console.error("WPAY_HOSTED_UNAVAILABLE");process.exitCode=1;});
module.exports={main};

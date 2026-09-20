"use strict";
const {createHash}=require("node:crypto");
const { createHostedPool,verifyRuntimeRole } = require("../lib/wpay/db/hosted-config");
const { validateMigrations,visibilityCounts } = require("../lib/wpay/db/migrations");
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
  let stage="runtime_config",pool,stopping=false,source,operational;
  try {
    pool=createHostedPool();
    stage="runtime_role";await verifyRuntimeRole(pool);
    const p=(await pool.query(`SELECT current_database() AS db,
      pg_catalog.to_regclass('wpay_auth.merchant_settlement_withdrawals') IS NOT NULL AS settlement_exists,
      pg_catalog.to_regclass('wpay_auth.parking_beneficiaries') IS NOT NULL AS beneficiary_exists,
      pg_catalog.to_regclass('wpay_auth.parking_orders') IS NOT NULL AS order_exists,
      pg_catalog.to_regclass('wpay_auth.parking_locks') IS NOT NULL AS lock_exists,
      pg_catalog.to_regclass('wpay_auth.parking_submissions') IS NOT NULL AS submission_exists`)).rows[0];
    const hash=value=>createHash("sha256").update(String(value||"")).digest("hex").slice(0,16);
    console.log("WPAY_RUNTIME_TARGET_DIAGNOSTIC",JSON.stringify({...p,dbHash:hash(p.db),targetHash:hash(process.env.WPAY_HOSTED_TARGET)}));
    stage="schema_validation";await validateMigrations(pool);
    stage="mfa_factors";const factors=await pool.query("SELECT account_id,factor_version,encrypted_secret FROM wpay_auth.account_security WHERE enabled=true");
    for(const factor of factors.rows)mfaCrypto.open(factor.encrypted_secret,`wpay-factor:${factor.account_id}:${factor.factor_version}`);
    stage="source_adapters";source=openLegacySource();operational=openOperationalSource();const pairingBridge=configuredPairingBridge();
    stage="server_start";const server=await startAuthServer({service:new AuthService(new SecurityRepository(pool,{throttleMode:"hosted"}),{mfaCrypto,legacyReader:source.reader,operationalSource:operational.source,pairingBridge,fundingProvider:fromEnvironment(),fixedCurrency:process.env.WPAY_HOSTED_FIXED_FEE_CURRENCY}),
      port:Number(process.env.PORT),hostedOrigin:policy.origin,readiness:async()=>{
        if(stopping)return false;
        try {await pool.query("SELECT 1");return true;}catch{return false;}
      }});
    const stop=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>server.closeAllConnections(),10000);deadline.unref();server.close(()=>{clearTimeout(deadline);pool.end().catch(()=>{});source.close().catch(()=>{});operational.close().catch(()=>{});});server.closeIdleConnections();};
    process.once("SIGTERM",stop);process.once("SIGINT",stop);
    console.log("WPay hosted authentication listening; legacy observations require an independently verified owner mapping and an available read-only source.");
    return server;
  }catch(error){if(pool&&stage==="schema_validation"){try{console.error("WPAY_RUNTIME_SCHEMA_VISIBILITY",JSON.stringify(await visibilityCounts(pool)));}catch{}}if(pool)await pool.end();if(source)await source.close();if(operational)await operational.close();const code=typeof error?.code==="string"&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:"UNKNOWN";const message=String(error?.message||"").replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[redacted]").replace(/[A-Za-z0-9_%-]+:[^@\s]+@/g,"[redacted]@").slice(0,240);console.error("WPAY_HOSTED_STARTUP_DIAGNOSTIC",stage,code,message);throw error;}
}
if(require.main===module)main().catch(()=>{console.error("WPAY_HOSTED_UNAVAILABLE");process.exitCode=1;});
module.exports={main};

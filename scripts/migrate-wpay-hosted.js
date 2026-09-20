"use strict";
const { createHostedPool } = require("../lib/wpay/db/hosted-config");
const { migrate,visibilityCounts } = require("../lib/wpay/db/migrations");
async function main(){
  try{
    const raw=process.env.WPAY_HOSTED_MIGRATION_DATABASE_URL||"",target=process.env.WPAY_HOSTED_TARGET||"",network=process.env.WPAY_HOSTED_NETWORK||"";
    let parsed=null;try{parsed=new URL(raw);}catch{}
    const safe={urlPresent:!!raw,protocolOk:!!parsed&&["postgres:","postgresql:"].includes(parsed.protocol),usernameOk:!!parsed&&decodeURIComponent(parsed.username)==="wpay_migrator",passwordPresent:!!parsed?.password,hostOk:!!parsed&&/^[a-z0-9][a-z0-9-]*\.railway\.internal$/.test(parsed.hostname),pathOk:!!parsed&&/^\/[a-z][a-z0-9_]{0,62}$/.test(parsed.pathname),portOk:!!parsed&&(!parsed.port||parsed.port==="5432"),targetMatches:!!parsed&&target===`${parsed.hostname}:5432/${parsed.pathname.slice(1)}`,networkOk:network==="railway-private-network"};
    console.log("WPAY_HOSTED_MIGRATION_CONFIG_CHECK",JSON.stringify(safe));
  }catch{}
  const pool=createHostedPool(process.env,"migration");
  try {
    const role=await pool.query("SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user");
    if(role.rows[0]?.name!=="wpay_migrator"||Object.entries(role.rows[0]).some(([k,v])=>k!=="name"&&v!==false))throw Error();
    const runtime=await pool.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime'");
    if(runtime.rowCount!==1)throw Error();
    console.log(`WPay hosted migrations: ${await migrate(pool)}`);console.log("WPAY_SCHEMA_VISIBILITY",JSON.stringify(await visibilityCounts(pool)));
  } finally {await pool.end();}
}
if(require.main===module)main().catch(error=>{const code=typeof error?.code==="string"&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:"UNKNOWN";const message=String(error?.message||"").replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[redacted]").replace(/[A-Za-z0-9_%-]+:[^@\s]+@/g,"[redacted]@").slice(0,240);console.error("WPAY_HOSTED_MIGRATION_UNAVAILABLE",code,message);process.exitCode=1;});
module.exports={main};

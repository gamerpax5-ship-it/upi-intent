"use strict";
const { createHostedPool } = require("../lib/wpay/db/hosted-config");
const { migrate } = require("../lib/wpay/db/migrations");
async function main(){
  const pool=createHostedPool(process.env,"migration");
  try {
    const role=await pool.query("SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user");
    if(role.rows[0]?.name!=="wpay_migrator"||Object.entries(role.rows[0]).some(([k,v])=>k!=="name"&&v!==false))throw Error();
    const runtime=await pool.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime'");
    if(runtime.rowCount!==1)throw Error();
    console.log(`WPay hosted migrations: ${await migrate(pool)}`);
  } finally {await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error("WPAY_HOSTED_MIGRATION_UNAVAILABLE");process.exitCode=1;});
module.exports={main};

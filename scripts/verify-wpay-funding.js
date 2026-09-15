"use strict";
const {createPool,readConfig}=require('../lib/wpay/db/config'),{validateMigrations}=require('../lib/wpay/db/migrations'),{FundingWorkflow}=require('../lib/wpay/funding/workflow'),{fromEnvironment}=require('../lib/wpay/funding/provider');
async function main(){if(process.argv.length!==3||process.argv[2]!=='--once'||readConfig().host!=='127.0.0.1')throw Error('Isolated local --once required');const pool=createPool();try{await validateMigrations(pool);const results=await new FundingWorkflow({provider:fromEnvironment()}).runBatch(pool);console.log(JSON.stringify({processed:results.length,states:results.map(r=>r.state)}));}finally{await pool.end();}}
if(require.main===module)main().catch(()=>{console.error('WPAY_FUNDING_WORKER_UNAVAILABLE');process.exitCode=1;});
module.exports={main};

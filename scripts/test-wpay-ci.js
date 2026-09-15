"use strict";
// GitHub's disposable PostgreSQL service only. Never use a deployment database.
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{Client}=require("pg");
if (process.env.GITHUB_ACTIONS !== "true" || process.env.WPAY_CI_ISOLATED !== "github-service-container") {
  console.error("Requires the isolated WPay CI job."); process.exit(1);
}
const env={...process.env};
for(const name of Object.keys(env))if(/DATABASE|SUPABASE|RAILWAY|WPAY_|PROVIDER|DASHBOARD|PHONEPE|UPI_DIAGNOSTICS|PUBLIC_BASE_URL/.test(name))delete env[name];
Object.assign(env,{
  WPAY_AUTH_DEV_DATABASE_URL:"postgresql://postgres:wpay-ci-disposable@127.0.0.1:5432/wpay_ci",
  WPAY_AUTH_DEV_ISOLATED_CONFIRM:"127.0.0.1:5432/wpay_ci",
  WPAY_AUTH_DEV_INTEGRATION_CONFIRM:"allow-new-synthetic-records",
  WPAY_AUTH_DEV_MFA_KEY:randomBytes(32).toString("base64")
});
const result=spawnSync(process.execPath,["--test","test/wpay-auth-security.integration.js","test/wpay-mfa-packages.integration.js"],{env,stdio:"inherit",windowsHide:true});
async function rolesAndResources(){
  if(result.status!==0){process.exitCode=1;return;}
  const connection={host:"127.0.0.1",port:5432,user:"postgres",password:"wpay-ci-disposable",database:"wpay_ci"};
  const client=new Client(connection);await client.connect();
  try{
    const passwords={};
    for(const role of ["wpay_migrator","wpay_runtime","wpay_legacy_reader"]){
      passwords[role]=randomBytes(24).toString("hex");
      await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '${passwords[role]}'`);
    }
    await client.query("CREATE DATABASE wpay_hosted_ci OWNER wpay_migrator");
    await client.query("CREATE DATABASE wpay_resources_ci OWNER wpay_migrator");
    await client.query("CREATE DATABASE wpay_legacy_ci");
    await client.query("CREATE DATABASE wpay_business_ci OWNER wpay_migrator");
    await client.query("CREATE DATABASE wpay_9a_correctness_ci OWNER wpay_migrator");
    await client.query("CREATE DATABASE wpay_9a_funding_ci OWNER wpay_migrator");
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"wpay-ci-"));
    const role=(user,database)=>({...connection,user,password:passwords[user],database});
    const hosted={migration:role("wpay_migrator","wpay_hosted_ci"),runtime:role("wpay_runtime","wpay_hosted_ci"),mfaKey:env.WPAY_AUTH_DEV_MFA_KEY};
    const resources={migration:role("wpay_migrator","wpay_resources_ci"),runtime:role("wpay_runtime","wpay_resources_ci"),
      legacyOwner:{...connection,database:"wpay_legacy_ci"},legacyReader:role("wpay_legacy_reader","wpay_legacy_ci"),mfaKey:env.WPAY_AUTH_DEV_MFA_KEY};
    const business={migration:role("wpay_migrator","wpay_business_ci"),runtime:role("wpay_runtime","wpay_business_ci"),mfaKey:env.WPAY_AUTH_DEV_MFA_KEY};
    const correctness={migration:role("wpay_migrator","wpay_9a_correctness_ci"),runtime:role("wpay_runtime","wpay_9a_correctness_ci"),mfaKey:env.WPAY_AUTH_DEV_MFA_KEY};
    const funding={migration:role("wpay_migrator","wpay_9a_funding_ci"),runtime:role("wpay_runtime","wpay_9a_funding_ci"),mfaKey:env.WPAY_AUTH_DEV_MFA_KEY};
    for(const [name,config,file,prefix] of [["hosted",hosted,"test/wpay-hosted-db.integration.js","WPAY_HOSTED_TEST"],["resources",resources,"test/wpay-resources.integration.js","WPAY_RESOURCE_TEST"],["business",business,"test/wpay-business.integration.js","WPAY_BUSINESS_TEST"],["correctness",correctness,"test/wpay-9a-correctness.integration.js","WPAY_9A_TEST"],["funding",funding,"test/wpay-9a-funding.integration.js","WPAY_9A_TEST"]]){
      const configPath=path.join(dir,name+".json");fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600,flag:"wx"});
      const run=spawnSync(process.execPath,["--test",file],{env:{...env,[prefix+"_CONFIRM"]:"fresh-local-synthetic-only",[prefix+"_CONFIG"]:configPath},stdio:"inherit",windowsHide:true});
      if(run.status!==0){process.exitCode=1;return;}
    }
  }finally{await client.end();}
}
rolesAndResources().catch(()=>{console.error("Isolated CI database setup failed.");process.exitCode=1;});

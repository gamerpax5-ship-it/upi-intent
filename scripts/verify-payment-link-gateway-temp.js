"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process"),{Client}=require("pg"),{randomBytes}=require("node:crypto");
(async()=>{
 const admin=new Client({host:"127.0.0.1",port:5432,user:"postgres",password:"gateway-verify",database:"postgres"});await admin.connect();
 const migratorPassword=randomBytes(18).toString("hex"),runtimePassword=randomBytes(18).toString("hex"),mfaKey=randomBytes(32).toString("base64");
 try{
  await admin.query("CREATE ROLE wpay_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '"+migratorPassword+"'");
  await admin.query("CREATE ROLE wpay_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '"+runtimePassword+"'");
  await admin.query("CREATE DATABASE wpay_9a_gateway_0 OWNER wpay_migrator");
 }finally{await admin.end();}
 const cfg={migration:{host:"127.0.0.1",port:5432,user:"wpay_migrator",password:migratorPassword,database:"wpay_9a_gateway_0"},runtime:{host:"127.0.0.1",port:5432,user:"wpay_runtime",password:runtimePassword,database:"wpay_9a_gateway_0"},mfaKey};
 const file=path.join(os.tmpdir(),"wpay-gateway-verify.json");fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
 const env={...process.env,WPAY_9A_TEST_CONFIRM:"fresh-local-synthetic-only",WPAY_9A_TEST_CONFIG:file};
 const run=spawnSync(process.execPath,["--test","test/wpay-gateway.integration.js"],{env,stdio:"inherit"});
 process.exit(run.status??1);
})().catch(e=>{console.error(e);process.exit(1);});

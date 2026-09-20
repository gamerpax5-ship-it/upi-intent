"use strict";
// Explicit invocation only, with a fresh, confirmed local synthetic database.
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {Pool}=require("pg");
const {migrate,validateMigrations}=require("../lib/wpay/db/migrations");
const {verifyRuntimeRole}=require("../lib/wpay/db/hosted-config");
const {AuthService}=require("../lib/wpay/auth/runtime/service");
const {SecurityRepository}=require("../lib/wpay/db/security-repository");
const {MfaCrypto}=require("../lib/wpay/auth/runtime/mfa");
test("hosted database roles: actual migrations, runtime MFA/session access, no DDL or audit mutation",async t=>{
  assert.equal(process.env.WPAY_HOSTED_TEST_CONFIRM,"fresh-local-synthetic-only");
  const config=JSON.parse(fs.readFileSync(process.env.WPAY_HOSTED_TEST_CONFIG,"utf8"));
  for(const name of ["migration","runtime"]){assert.equal(config[name].host,"127.0.0.1");assert.match(config[name].database,/^wpay_(7_hosted_[0-9]+|hosted_ci)$/);}
  assert.equal(config.migration.database,config.runtime.database);assert.equal(config.migration.port,config.runtime.port);
  const owner=new Pool(config.migration),runtime=new Pool(config.runtime);
  t.after(async()=>{await owner.end();await runtime.end();});
  assert.equal((await owner.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname IN ('wpay_auth','public')")).rowCount,0,"Fresh isolated DB required; never clear an existing target.");
  await migrate(owner);await validateMigrations(owner);await validateMigrations(runtime);await verifyRuntimeRole(runtime);
  await t.test("runtime has no migration, table creation, audit deletion or bootstrap write privileges",async()=>{
    for(const sql of ["CREATE TABLE wpay_auth.unauthorized(id integer)","CREATE SCHEMA unauthorized", "UPDATE wpay_auth.schema_migrations SET checksum=checksum",
      "DELETE FROM wpay_auth.security_audit", "UPDATE wpay_auth.security_audit SET event=event", "UPDATE wpay_auth.bootstrap_state SET singleton=singleton"]){
      await assert.rejects(runtime.query(sql),{code:"42501"});
    }
    // An already-current migration run is a read-only validation, not DDL.
    assert.equal(await migrate(runtime),"already-applied");
  });
  const crypto=new MfaCrypto(Buffer.from(config.mfaKey,"base64"));
  const ownerService=new AuthService(new SecurityRepository(owner),{mfaCrypto:crypto});
  const service=new AuthService(new SecurityRepository(runtime),{mfaCrypto:crypto});
  const password="Synthetic hosted role acceptance password 1!";
  await ownerService.bootstrap({name:"Synthetic Hosted Admin",email:"admin@hosted.example.invalid",password});
  await t.test("runtime performs real TOTP enrollment, persistent session authorization and logout",async()=>{
    const first=await service.login({email:"admin@hosted.example.invalid",password},"127.0.0.1");assert.equal(first.stage,"enroll");
    await assert.rejects(service.authenticated(first.challengeToken,"me"));
    const setup=await service.mfa.challenge(first.challengeToken,"setup",{});
    const epoch=Math.floor(new Date((await owner.query("SELECT CURRENT_TIMESTAMP AS now")).rows[0].now).getTime()/1000);
    const code=await crypto.libraries().otp.generate({secret:setup.setupKey,epoch});
    const verified=await service.mfa.challenge(first.challengeToken,"verify",{code});assert.equal(verified.stage,"save-recovery");
    const promoted=await service.mfa.challenge(verified.challengeToken,"complete",{saved:true});
    assert.equal((await service.authenticated(promoted.sessionToken,"me")).accountType,"super_admin");
    const restarted=new AuthService(new SecurityRepository(runtime),{mfaCrypto:new MfaCrypto(Buffer.from(config.mfaKey,"base64"))});
    assert.equal((await restarted.authenticated(promoted.sessionToken,"me")).accountType,"super_admin");
    await restarted.authenticated(promoted.sessionToken,"logout");await assert.rejects(service.authenticated(promoted.sessionToken,"me"));
  });
  await t.test("runtime registration remains pending and cannot bootstrap another administrator",async()=>{
    await service.register({name:"Synthetic Pending User",email:"user@hosted.example.invalid",password,accountType:"user"},"127.0.0.1");
    await assert.rejects(service.login({email:"user@hosted.example.invalid",password},"127.0.0.1"),{code:"APPROVAL_PENDING"});
    await assert.rejects(service.bootstrap({name:"Forbidden Admin",email:"forbidden@hosted.example.invalid",password}));
  });
});

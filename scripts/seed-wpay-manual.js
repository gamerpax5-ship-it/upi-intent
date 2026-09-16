"use strict";
// Explicitly local and empty databases only. No production seed/MFA bypass.
const fs=require('node:fs'),path=require('node:path'),{randomBytes,randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../lib/wpay/db/migrations'),{SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService,DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),{hashPassword}=require('../lib/wpay/auth/runtime/passwords'),{getPermission}=require('../lib/wpay/permission-catalog');
function validate(config,output,origin){
 if(process.env.WPAY_MANUAL_CONFIRM!=='empty-local-development-only'||process.env.NODE_ENV==='production')throw Error();
 for(const [key,role]of [['migration','wpay_migrator'],['runtime','wpay_runtime']]){const c=config[key];if(c?.host!=='127.0.0.1'||!Number.isInteger(c.port)||c.port<1||c.port>65535||c.user!==role||!/^wpay_12_manual_\d+$/.test(c.database)||!c.password)throw Error();}
 if(config.runtime.database!==config.migration.database||config.runtime.port!==config.migration.port)throw Error();
 if(typeof config.mfaKey!=='string'||Buffer.from(config.mfaKey,'base64').length!==32)throw Error();
 const u=new URL(origin);if(u.origin!==origin||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password)throw Error();
 output=path.resolve(output);const parent=fs.realpathSync(path.dirname(output)),repo=fs.realpathSync(path.resolve(__dirname,'..')),relative=path.relative(repo,parent);
 if(relative===''||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))||fs.existsSync(output))throw Error();
 // A different checkout is no safer than this one for credential artifacts.
 for(let p=parent;;p=path.dirname(p)){if(fs.existsSync(path.join(p,'.git')))throw Error();if(p===path.dirname(p))break;}
 return path.join(parent,path.basename(output));
}
async function seed(config,output,origin){
 output=validate(config,output,origin);const owner=new Pool(config.migration),runtime=new Pool(config.runtime);
 try{
  if((await owner.query("SELECT 1 FROM pg_tables WHERE schemaname IN('public','wpay_auth')")).rowCount)throw Error();
  fs.mkdirSync(output,{mode:0o700});await migrate(owner);
  const crypto=new MfaCrypto(Buffer.from(config.mfaKey,'base64')),service=new AuthService(new SecurityRepository(runtime),{mfaCrypto:crypto,fixedCurrency:'INR'}),setup=new SecurityRepository(owner),records=[];
  const persist=()=>fs.writeFileSync(path.join(output,'manual-test-accounts.json'),JSON.stringify({synthetic:true,origin,accounts:records},null,2),{mode:0o600});
  const password=()=> 'WPay!'+randomBytes(24).toString('base64url');
  async function enroll(record){
   persist();const login=await service.login({email:record.email,password:record.password},'127.0.0.1',record.role),factor=await service.mfa.challenge(login.challengeToken,'setup',{},record.role);
   record.setupKey=factor.setupKey;record.qrFile=record.role+'-authenticator.png';persist();fs.writeFileSync(path.join(output,record.qrFile),Buffer.from(factor.qrDataUrl.split(',')[1],'base64'),{flag:'wx',mode:0o600});
   const code=await crypto.libraries().otp.generate({secret:factor.setupKey}),verified=await service.mfa.challenge(login.challengeToken,'verify',{code},record.role);record.recoveryCodes=verified.recoveryCodes;persist();
   const complete=await service.mfa.challenge(verified.challengeToken,'complete',{saved:true},record.role);record.mfaEnrolled=true;persist();return complete.sessionToken;
  }
  const admin={role:'admin',email:'admin@manual.example.invalid',password:password(),loginUrl:origin+'/admin'};records.push(admin);
  const permissions=DEFAULT_GRANTS.super_admin.filter(p=>getPermission(p).principalTypes.includes('admin'));
  admin.id=await setup.createAccount({name:'Manual Admin',email:admin.email,accountType:'admin'},await hashPassword(admin.password),permissions);
  await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[admin.id,{tenantIds:['wpay-auth-development']}]);await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=$1",[admin.id]);
  const adminSession=await enroll(admin);
  for(const role of ['user','merchant']){
   const record={role,email:role+'@manual.example.invalid',password:password(),loginUrl:origin+'/'+role};records.push(record);persist();
   await service.register({name:'Manual '+role,email:record.email,password:record.password,accountType:role},'127.0.0.1',role);
   record.id=(await owner.query('SELECT id FROM wpay_auth.accounts WHERE email=$1',[record.email])).rows[0].id;
   const settings=role==='user'?{payinCommission:'1.25',payoutCommission:'0.5',inrPerUsdt:'85.75',depositNetwork:'ETHEREUM-ERC20',depositAddress:'0x'+'1'.repeat(40)}:{payinFee:'1.2',payoutFee:'0.7',fixedPayoutFee:'0.5',fixedFeeCurrency:'INR'};
   await service.authenticated(adminSession,'approval',0,{requestId:randomUUID(),accountId:record.id,decision:'approve',settings,reason:''},'admin');const session=await enroll(record);await service.authenticated(session,'logout-all',0,{},role);
  }
  const employee=await service.authenticated(adminSession,'operations/employee/create',0,{name:'Manual Employee',email:'employee@manual.example.invalid',permissions:['profile.view','account_security.view','account_security.update','apk_otp_events.view_all'],tenantIds:['wpay-auth-development']},'admin');
  const record={id:employee.id,role:'employee',email:employee.email,password:employee.oneTimePassword,loginUrl:origin+'/employee'};records.push(record);const employeeSession=await enroll(record);await service.authenticated(employeeSession,'logout-all',0,{},'employee');await service.authenticated(adminSession,'logout-all',0,{},'admin');
  fs.writeFileSync(path.join(output,'README.txt'),'PRIVATE LOCAL ACCOUNTS — never commit or share publicly.\nImport each PNG into your authenticator. Passwords, setup keys and recovery codes are in manual-test-accounts.json.\nAll four accounts use real mandatory MFA. The approved User is unfunded and has no linked device. No banking OTP, payment or bank evidence was manufactured.\nDo not send money to the synthetic approval address.\n',{flag:'wx',mode:0o600});
  return {output,accounts:records.length,mfaEnrolled:records.every(r=>r.mfaEnrolled)};
 }finally{await runtime.end();await owner.end();}
}
if(require.main===module){const [configFile,output,origin]=process.argv.slice(2);if(process.argv.length!==5)throw Error('Require private config, new external output directory and loopback origin');seed(JSON.parse(fs.readFileSync(configFile,'utf8')),output,origin).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('WPAY_MANUAL_SEED_FAILED: require a fresh isolated local database and a new private directory outside Git; existing files and keys were preserved.');process.exitCode=1;});}
module.exports={validate,seed};

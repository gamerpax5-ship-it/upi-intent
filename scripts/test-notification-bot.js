'use strict';
// Focused, real local PostgreSQL checks. Never reads production DB settings.
const {mkdtemp,rm}=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
async function main(){
 const {default:EmbeddedPostgres}=await import('embedded-postgres');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const root=path.resolve(os.tmpdir()),directory=await mkdtemp(path.join(root,'wpay-notification-test-')),password=randomBytes(20).toString('hex');
 const database=new EmbeddedPostgres({databaseDir:directory,port,user:'postgres',password,persistent:true,createPostgresUser:false,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1','-c','io_method=sync'],onLog:()=>{},onError:()=>{}});
 try{
  await database.initialise();await database.start();
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/DATABASE|SUPABASE|RAILWAY|WPAY|PROVIDER|DASHBOARD|WALLET|TELEGRAM/i.test(k)));
  env.TEST_DATABASE_URL=`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;env.TZ='UTC';env.PGTZ='UTC';env.NODE_ENV='test';
  const {Pool}=require('pg'),setup=new Pool({connectionString:env.TEST_DATABASE_URL});
  try{await setup.query('CREATE ROLE wpay_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');}finally{await setup.end();}
  const child=spawn(process.execPath,['--test','--test-concurrency=1','test/wpay-notification-bot.test.js','test/wpay-notification-bot-postgres.test.js','test/wpay-notification-received-postgres.test.js','test/wpay-notification-usernames.test.js','test/wpay-utr-approval.test.js','test/wpay-gateway.test.js'],{env,stdio:'inherit',windowsHide:true});
  process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 }finally{
  await database.stop();const resolved=path.resolve(directory);
  if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith('wpay-notification-test-'))throw Error('UNSAFE_TEST_CLEANUP');
  await rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
}
main().catch(()=>{console.error('NOTIFICATION_LOCAL_TEST_FAILED');process.exitCode=1;});

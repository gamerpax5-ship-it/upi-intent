'use strict';
const {randomUUID}=require('node:crypto');
const {empty}=require('./mappings');
const {group,fail}=require('./policy');
class Store{
 constructor(pool){this.pool=pool;}
 async transaction(fn){const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
 async group(chat,tenants,fn){
  if(!group(chat)||!Array.isArray(tenants)||!tenants.length||tenants.some(t=>typeof t!=='string'||!t))fail('INVALID_GROUP_SCOPE');
  return this.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,57415944))',[String(chat.id)]);
   await c.query('INSERT INTO wpay_auth.notification_bot_groups(chat_id,chat_type,tenant_ids,state) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[String(chat.id),chat.type,tenants,empty()]);
   const current=(await c.query('SELECT * FROM wpay_auth.notification_bot_groups WHERE chat_id=$1 FOR UPDATE',[String(chat.id)])).rows[0];
   if(current.tenant_ids.length!==tenants.length||current.tenant_ids.some(t=>!tenants.includes(t)))fail('GROUP_SCOPE_CHANGED');
   return fn(c,current);
  });
 }
 async save(c,current,state,actor,operation){
  const result=await c.query('UPDATE wpay_auth.notification_bot_groups SET state=$2,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE chat_id=$1 AND revision=$3 RETURNING revision',[current.chat_id,state,current.revision]);
  if(result.rowCount!==1)fail('GROUP_CHANGED');
  await c.query('INSERT INTO wpay_auth.notification_bot_audit(id,chat_id,actor_id,operation,revision) VALUES($1,$2,$3,$4,$5)',[randomUUID(),current.chat_id,String(actor),operation,result.rows[0].revision]);
 }
 async account(c,mail,type,tenants){return (await c.query("SELECT id,name,email,account_type,status,tenant_id FROM wpay_auth.accounts WHERE email=$1 AND account_type=$2 AND tenant_id=ANY($3)",[mail,type,tenants])).rows[0];}
 async adminAccount(c,mail,tenants){return (await c.query("SELECT id,name,email,account_type,status,tenant_id FROM wpay_auth.accounts WHERE email=$1 AND account_type IN('admin','super_admin') AND status='active' AND tenant_id=ANY($2)",[mail,tenants])).rows[0];}
 async accept(updateId,payload){await this.pool.query('INSERT INTO wpay_auth.notification_bot_updates(update_id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',[updateId,payload]);}
 async pending(){return (await this.pool.query('SELECT update_id,payload,attempts FROM wpay_auth.notification_bot_updates WHERE NOT processed AND attempts<5 ORDER BY update_id LIMIT 20')).rows;}
 async processed(c,updateId){return (await c.query('SELECT processed FROM wpay_auth.notification_bot_updates WHERE update_id=$1 FOR UPDATE',[updateId])).rows[0]?.processed===true;}
 async mark(c,updateId){await c.query('UPDATE wpay_auth.notification_bot_updates SET processed=true WHERE update_id=$1',[updateId]);}
}
module.exports={Store};

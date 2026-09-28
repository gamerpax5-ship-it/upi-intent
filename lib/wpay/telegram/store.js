'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
class Store{
 constructor(pool){this.pool=pool;this.context=new AsyncLocalStorage();}
 db(){return this.context.getStore()||this.pool;}
 async exclusive(chatId,fn){
  const c=await this.pool.connect();
  try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,57415933))',['telegram:'+chatId]);
   const state=(await c.query('SELECT settings FROM wpay_auth.telegram_groups WHERE chat_id=$1',[chatId])).rows[0]?.settings;
   const result=await this.context.run(c,()=>fn(state));await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 }
 async accept(updateId,message){await this.pool.query('INSERT INTO wpay_auth.telegram_updates(update_id,message) VALUES($1,$2) ON CONFLICT DO NOTHING',[updateId,message]);}
 async pending(){return (await this.pool.query('SELECT update_id,message,attempts FROM wpay_auth.telegram_updates WHERE NOT processed AND attempts<5 ORDER BY update_id LIMIT 10')).rows;}
 async attempt(id){await this.pool.query('UPDATE wpay_auth.telegram_updates SET attempts=attempts+1 WHERE update_id=$1',[id]);}
 async processed(id){return (await this.db().query('SELECT processed FROM wpay_auth.telegram_updates WHERE update_id=$1',[id])).rows[0]?.processed===true;}
 async markProcessed(id){await this.db().query('UPDATE wpay_auth.telegram_updates SET processed=true WHERE update_id=$1',[id]);}
 async save(chat,settings){await this.db().query('INSERT INTO wpay_auth.telegram_groups(chat_id,chat_type,settings) VALUES($1,$2,$3) ON CONFLICT(chat_id) DO UPDATE SET settings=EXCLUDED.settings,chat_type=EXCLUDED.chat_type,updated_at=CURRENT_TIMESTAMP',[chat.id,chat.type,settings]);}
 async groups(){return (await this.pool.query('SELECT chat_id,chat_type FROM wpay_auth.telegram_groups')).rows.map(r=>({chat:{id:r.chat_id,type:r.chat_type}}));}
 async delivered(chat,kind,id){return !!(await this.db().query('SELECT 1 FROM wpay_auth.telegram_deliveries WHERE chat_id=$1 AND kind=$2 AND event_id=$3',[chat,kind,id])).rowCount;}
 async markDelivered(chat,kind,id){await this.pool.query('INSERT INTO wpay_auth.telegram_deliveries(chat_id,kind,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[chat,kind,id]);}
}
module.exports={Store};

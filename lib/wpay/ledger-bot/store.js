'use strict';
class Store{
 constructor(pool){this.pool=pool;}
 async bind(chat,account,actorId){await this.pool.query(`INSERT INTO wpay_auth.telegram_balance_groups(chat_id,chat_type,account_id,account_type,bound_by,bound_at,updated_at)
  VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(chat_id) DO UPDATE SET chat_type=EXCLUDED.chat_type,account_id=EXCLUDED.account_id,account_type=EXCLUDED.account_type,bound_by=EXCLUDED.bound_by,bound_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,[chat.id,chat.type,account.id,account.account_type,String(actorId)]);return account;}
 async unbind(chatId){await this.pool.query('DELETE FROM wpay_auth.telegram_balance_groups WHERE chat_id=$1',[chatId]);}
 async binding(chatId){return (await this.pool.query(`SELECT g.chat_id,g.chat_type,g.account_id,g.account_type,g.bound_by,g.bound_at,g.updated_at,a.name,a.email,a.status,e.approval_status
  FROM wpay_auth.telegram_balance_groups g JOIN wpay_auth.accounts a ON a.id=g.account_id LEFT JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE g.chat_id=$1`,[chatId])).rows[0]||null;}
 async accept(updateId,message){await this.pool.query('INSERT INTO wpay_auth.telegram_balance_updates(update_id,message) VALUES($1,$2) ON CONFLICT DO NOTHING',[updateId,message]);}
 async pending(){return (await this.pool.query('SELECT update_id,message,attempts FROM wpay_auth.telegram_balance_updates WHERE NOT processed AND attempts<5 ORDER BY update_id LIMIT 10')).rows;}
 async attempt(id){await this.pool.query('UPDATE wpay_auth.telegram_balance_updates SET attempts=attempts+1 WHERE update_id=$1',[id]);}
 async processed(id){return (await this.pool.query('SELECT processed FROM wpay_auth.telegram_balance_updates WHERE update_id=$1',[id])).rows[0]?.processed===true;}
 async markProcessed(id){await this.pool.query('UPDATE wpay_auth.telegram_balance_updates SET processed=true WHERE update_id=$1',[id]);}
}
module.exports={Store};
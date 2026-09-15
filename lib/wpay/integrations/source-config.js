"use strict";
const {Pool}=require('pg');
const {AuthError}=require('../auth/runtime/errors');
const {createLegacyReader}=require('./legacy-reader');
function readSourceConfig(env=process.env){
  if(!env.WPAY_LEGACY_READER_DATABASE_URL&&!env.WPAY_LEGACY_READER_TARGET)return null;
  try{
    const url=new URL(env.WPAY_LEGACY_READER_DATABASE_URL),host=url.hostname,port=Number(url.port||5432),database=url.pathname.slice(1);
    const local=['127.0.0.1','[::1]'].includes(host);
    const privateHost=/^[a-z0-9][a-z0-9-]*\.railway\.internal$/.test(host)&&env.WPAY_HOSTED_NETWORK==='railway-private-network';
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||
      decodeURIComponent(url.username)!=='wpay_legacy_reader'||!url.password||
      !/^[a-z][a-z0-9_]{0,62}$/.test(database)||(!local&&!privateHost)||
      !Number.isInteger(port)||port<1||port>65535||(!local&&port!==5432)||
      env.WPAY_LEGACY_READER_TARGET!==`${host}:${port}/${database}`)throw 0;
    return {host:host.replace(/^\[|\]$/g,''),port,database,user:'wpay_legacy_reader',password:decodeURIComponent(url.password),
      ssl:false,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:3000,
      options:'-c search_path=pg_catalog -c default_transaction_read_only=on',application_name:'wpay-legacy-observations'};
  }catch{throw new AuthError('UNAVAILABLE');}
}
function openLegacySource(env=process.env){
  const config=readSourceConfig(env);
  if(!config)return {reader:null,close:async()=>{}};
  const pool=new Pool(config);pool.on('error',()=>{});
  // Recheck the role on every operation. A changed grant cannot silently widen
  // this adapter. This module never creates roles, grants access or changes data.
  const reader=Object.freeze({sourceId:'legacy-primary',
    async ready(){try{await createLegacyReader(pool);return true;}catch{return false;}},
    async read(...args){try{return await (await createLegacyReader(pool)).read(...args);}catch{throw new AuthError('UNAVAILABLE');}}
  });
  return {reader,close:()=>pool.end()};
}
module.exports={readSourceConfig,openLegacySource};

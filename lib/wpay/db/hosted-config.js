"use strict";
const { Pool } = require("pg");
const { AuthError } = require("../auth/runtime/errors");
function readHostedConfig(env=process.env,mode="runtime") {
  try {
    if (!["runtime","migration"].includes(mode)) throw 0;
    if (mode === "runtime" && env.WPAY_HOSTED_MIGRATION_DATABASE_URL) throw 0;
    const url=new URL(env[mode === "runtime" ? "WPAY_HOSTED_DATABASE_URL" : "WPAY_HOSTED_MIGRATION_DATABASE_URL"]);
    const user=mode === "runtime" ? "wpay_runtime" : "wpay_migrator";
    if (!["postgres:","postgresql:"].includes(url.protocol) || url.search || url.hash ||
        decodeURIComponent(url.username)!==user || !url.password ||
        !/^[a-z0-9][a-z0-9-]*\.railway\.internal$/.test(url.hostname) ||
        !/^\/[a-z][a-z0-9_]{0,62}$/.test(url.pathname) || (url.port && url.port!=="5432")) throw 0;
    const database=url.pathname.slice(1);
    if (env.WPAY_HOSTED_TARGET !== `${url.hostname}:5432/${database}` ||
        env.WPAY_HOSTED_NETWORK !== "railway-private-network") throw 0;
    return {host:url.hostname,port:5432,database,user,password:decodeURIComponent(url.password),
      // Private Railway networking only; never used on a public TCP endpoint.
      ssl:false,max:mode === "runtime" ? 4 : 1,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,
      statement_timeout:5000,options:"-c search_path=pg_catalog",application_name:`wpay-hosted-${mode}`};
  } catch { throw new AuthError("UNAVAILABLE"); }
}
function createHostedPool(env,mode) {
  const pool=new Pool(readHostedConfig(env,mode));pool.on("error",()=>{});return pool;
}
async function verifyRuntimeRole(pool) {
  const result=await pool.query(`SELECT current_user AS name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    pg_catalog.has_schema_privilege(current_user,'wpay_auth','CREATE') AS schema_create,
    pg_catalog.has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS has_memberships,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='wpay_auth' AND c.relowner=r.oid) AS owns_objects
    FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`);
  const row=result.rows[0];
  if (!row || row.name!=="wpay_runtime" || Object.entries(row).some(([key,value])=>key!=="name"&&value!==false)) throw new AuthError("UNAVAILABLE");
}
module.exports={readHostedConfig,createHostedPool,verifyRuntimeRole};

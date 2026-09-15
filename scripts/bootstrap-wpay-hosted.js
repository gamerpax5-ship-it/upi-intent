"use strict";
// Operator-only, one-time bootstrap. Never mount this operation on HTTP.
const {createHostedPool}=require('../lib/wpay/db/hosted-config');
const {validateMigrations}=require('../lib/wpay/db/migrations');
const {SecurityRepository}=require('../lib/wpay/db/security-repository');
const {AuthService}=require('../lib/wpay/auth/runtime/service');
async function main(){
 if(process.argv.length!==2 || process.env.NODE_ENV!=='production' || !process.env.WPAY_HOSTED_TARGET ||
    process.env.WPAY_HOSTED_BOOTSTRAP_CONFIRM!==process.env.WPAY_HOSTED_TARGET)throw Error();
 const input={name:process.env.WPAY_HOSTED_BOOTSTRAP_NAME,email:process.env.WPAY_HOSTED_BOOTSTRAP_EMAIL,password:process.env.WPAY_HOSTED_BOOTSTRAP_PASSWORD};
 const pool=createHostedPool(process.env,'migration');
 try{await validateMigrations(pool);await new AuthService(new SecurityRepository(pool)).bootstrap(input);console.log('Initial WPay administrator created; mandatory authenticator enrollment remains required.');}
 finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('WPAY_HOSTED_BOOTSTRAP_UNAVAILABLE');process.exitCode=1;});
module.exports={main};

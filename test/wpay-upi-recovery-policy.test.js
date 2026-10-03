"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
test("UPI recovery policy preserves routes and separates Admin force from User recovery",()=>{
 const core=fs.readFileSync("lib/wpay/business/core.js","utf8");
 const admin=fs.readFileSync("lib/wpay/business/admin-upi.js","utf8");
 const worker=fs.readFileSync("lib/wpay/notification-bot/worker.js","utf8");
 const routing=fs.readFileSync("lib/wpay/business/routing.js","utf8");
 assert.doesNotMatch(core,/UPDATE wpay_auth\.business_assignments SET status='disabled'.*bank_id=\$1/);
 assert.match(admin,/adminOverride:true/);
 assert.match(admin,/!adminManaged&&bank\.verified_version!==bank\.version/);
 assert.match(worker,/upi_start_blocked/);
 assert.match(worker,/upi_requirement_notice/);
 assert.match(worker,/adminManaged:bank\.admin_managed===true/);
 assert.match(routing,/const adminForce=candidate\.adminForceOverride===true/);
});

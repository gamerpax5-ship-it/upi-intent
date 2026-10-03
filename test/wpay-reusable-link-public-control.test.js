"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
test("reusable payment links are public assets and Merchant-managed",()=>{
 const http=fs.readFileSync("lib/wpay/auth/runtime/http.js","utf8");
 const api=fs.readFileSync("lib/wpay/gateway/api.js","utf8");
 const migration=fs.readFileSync("migrations/wpay-auth/041_gateway_payment_link_runtime_update.sql","utf8");
 assert.match(http,/topup\.js/);assert.match(http,/topup\.html/);
 assert.match(api,/linkUpdate\?'merchant\.gateway\.manage'/);
 assert.doesNotMatch(api,/creating\|\|linkUpdate\?'merchant\.gateway\.create'/);
 assert.match(migration,/GRANT UPDATE ON wpay_auth\.gateway_payment_links TO wpay_runtime/);
});

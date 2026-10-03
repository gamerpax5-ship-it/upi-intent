"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
test("reusable top-up is amount-only and checkout-themed",()=>{
 const html=fs.readFileSync("dev/wpay-auth/web/topup.html","utf8");
 const js=fs.readFileSync("dev/wpay-auth/web/topup.js","utf8");
 const css=fs.readFileSync("dev/wpay-auth/web/topup.css","utf8");
 const http=fs.readFileSync("lib/wpay/auth/runtime/http.js","utf8");
 assert.doesNotMatch(html,/Customer \/ wallet reference/i);
 assert.doesNotMatch(html,/name="customerReference"/);
 assert.match(html,/WPAY Secure Top Up/);
 assert.match(html,/Payments\s*<br>Made/);
 assert.match(html,/Continue to payment/);
 assert.doesNotMatch(js,/form\.get\('customerReference'\)/);
 assert.match(css,/#070b25/);
 assert.match(css,/linear-gradient\(90deg,#865fff,#5531e0\)/);
 assert.match(http,/topup\.css/);
});

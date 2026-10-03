"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
test("public reusable checkout accepts amount-only payload",()=>{
 const http=fs.readFileSync("lib/wpay/auth/runtime/http.js","utf8");
 const js=fs.readFileSync("dev/wpay-auth/web/topup.js","utf8");
 assert.match(http,/Object\.hasOwn\(body,'customerReference'\)\?\['amountMinor','customerReference','requestId'\]:\['amountMinor','requestId'\]/);
 assert.match(js,/\{amountMinor:minor\(form\.get\('amount'\)\),requestId\}/);
});

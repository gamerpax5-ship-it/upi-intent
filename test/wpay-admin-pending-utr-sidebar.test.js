"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
test("premium Admin sidebar exposes existing Pending UTR page",()=>{
 const ui=fs.readFileSync("dev/wpay-auth/web/admin-ui.js","utf8");
 const operations=fs.readFileSync("lib/wpay/operations/access.js","utf8");
 assert.match(operations,/destinationId:'operations\.'\+id/);
 assert.match(operations,/\['pending-utrs','utr_center\.view','Pending UTR'\]/);
 assert.match(ui,/\['Pending UTR',byDest\('operations\.pending-utrs'\)\?'operations\.pending-utrs':null,'utr'\]/);
});

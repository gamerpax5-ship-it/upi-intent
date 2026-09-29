'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('dev/wpay-auth/web/user-burgundy-live.css','utf8').split('/* Shared User sizing contract.')[1];
test('User sizing contract wins against prototype typography without changing colours or visibility',()=>{
 assert.ok(css);assert.match(css,/font-size:26px!important/);assert.match(css,/font-size:18px!important/);assert.match(css,/font-size:14px!important/);assert.match(css,/font-size:12px!important/);
 assert.doesNotMatch(css,/display:none|pointer-events:none|--burg|--panel:|background:/);
});
test('User cards and inline actions keep gaps with compact mobile sizing',()=>{
 assert.match(css,/margin-inline-end:8px/);assert.match(css,/gap:var\(--user-gap\)/);assert.match(css,/min-height:40px;height:auto/);assert.match(css,/margin-top:var\(--user-gap\)/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/--user-pad:16px;--user-gap:14px/);
});

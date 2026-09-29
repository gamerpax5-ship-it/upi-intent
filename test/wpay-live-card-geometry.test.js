'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('dev/wpay-auth/web/user-burgundy-live.css','utf8');
test('Live card adapters preserve reference spacing without a doubled hero gap',()=>{
 assert.match(css,/\.user-burgundy #page-content\.live-content\{gap:12px\}/);
 assert.match(css,/\.user-burgundy #page-content>\.page-hero\+\*\{margin-top:0\}/);
 assert.match(css,/\.reference-workflow-shell>\.grid\{align-items:start\}/);
});
test('Variable live balance facts fit cards and headings align without altering visibility',()=>{
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,130px\),1fr\)\)/);
 assert.match(css,/\.card>h2:first-child\{margin-top:0;margin-bottom:13px\}/);
 assert.match(css,/\.workflow-form>label>\.control\{font-weight:400\}/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});

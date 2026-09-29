'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('dev/wpay-auth/web/user-burgundy-live.css','utf8'),reference=fs.readFileSync('dev/wpay-auth/web/user-burgundy.css','utf8');
test('User reference owns typography and colours while live adapters retain visibility safeguards',()=>{
 assert.match(css,/@import url\('\/wpay-auth\/reference-live\.css'\) layer\(live-defaults\)/);assert.match(css,/@layer live-defaults/);
 assert.match(reference,/--font:Inter,ui-sans-serif/);assert.match(reference,/--burg:#781737;--burg2:#a72d57/);
 assert.doesNotMatch(css,/font-size:\s*\d+px!important/);assert.match(css,/\[hidden\]\{display:none!important\}/);
});
test('User cards and inline actions keep gaps with compact mobile sizing',()=>{
 assert.match(css,/margin-inline-end:8px/);assert.match(css,/#page-content.live-content\{gap:12px\}/);assert.match(css,/display:flex;flex-wrap:wrap;gap:8px/);assert.match(reference,/\.btn\{min-height:38px/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/\.analytics-kpis\{grid-template-columns:1fr;gap:16px\}/);
});

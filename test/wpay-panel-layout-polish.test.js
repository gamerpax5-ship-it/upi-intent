'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('panel polish retains readable headings, medium controls and contained tables',()=>{
 for(const file of ['admin-ui.css','merchant-premium.css','user-burgundy-live.css']){
  const css=fs.readFileSync('dev/wpay-auth/web/'+file,'utf8');
  assert.match(css,/#workspace[^{}]*\{[^{}]*font-weight:400/);
  assert.match(css,/#workspace :is\(h1,h2,h3,h4\)\{[^{}]*font-weight:600/);
  assert.match(css,/#workspace :is\(button,\.btn,\.nav-item\)\{font-weight:500(?:!important)?\}/);
  assert.match(css,/min-width:0;max-width:100%/);assert.match(css,/overflow-x:auto/);
 }
 const css=fs.readFileSync('dev/wpay-auth/web/admin-ui.css','utf8');assert.ok(css.includes('minmax(min(100%,340px),1fr)'));assert.ok(css.includes('#page-content .grid>*{min-width:0}'));
});
test('Merchant final typography wins over legacy important prototype rules',()=>{
 const css=fs.readFileSync('dev/wpay-auth/web/merchant-premium.css','utf8');
 assert.ok(css.includes('#workspace :is(h1,h2,h3,h4){font-weight:600!important;'));
 assert.ok(css.includes('#workspace :is(button,.btn,.nav-item){font-weight:500!important}'));
});
test('Admin login guidance explains optional login MFA without changing transaction confirmation',()=>{
 const source=fs.readFileSync('dev/wpay-auth/web/app.js','utf8');assert.ok(source.includes('If you enable login 2FA in Security'));assert.ok(source.includes('Sensitive actions use password confirmation.'));
});
test('User topbar controls have accessible labels and a native keyboard-operable profile button',()=>{
 const html=fs.readFileSync('dev/wpay-auth/web/user-live.html','utf8');
 for(const label of ['Notifications','Security','Profile','Search User sections'])assert.ok(html.includes('aria-label="'+label+'"'));
 assert.ok(html.includes('<button type="button" aria-label="Profile" data-go="profile" class="top-user">'));
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='dev/wpay-auth/web/';
test('User deposit QR encodes only the assigned address with a quiet zone, without network calls',()=>{
 const context={TextEncoder,Uint8Array,Uint16Array,Uint32Array};vm.runInNewContext(fs.readFileSync(root+'user-deposit-qr.js','utf8'),context);
 const address='TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',expected=require('../lib/wpay/auth/runtime/dependencies/node_modules/qrcode').create(address,{errorCorrectionLevel:'M'});let pixels;
 const canvas={style:{},getContext:()=>({clearRect(){},createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image;}})};
 context.WPayDepositQr.draw(canvas,address);assert.equal(canvas.width,176);assert.equal(canvas.height,176);
 const scale=176/(expected.modules.size+8);
 for(let y=0;y<expected.modules.size;y++)for(let x=0;x<expected.modules.size;x++){
  const px=Math.floor((x+4.5)*scale),py=Math.floor((y+4.5)*scale),offset=(py*176+px)*4;assert.equal(pixels.data[offset],expected.modules.get(y,x)?0:255);
 }
 assert.equal(pixels.data[0],255);assert.throws(()=>context.WPayDepositQr.draw(canvas,''));assert.throws(()=>context.WPayDepositQr.draw(canvas,'x'.repeat(257)));
});
test('Compact User adapters preserve forms, original actions and all deposit facts',()=>{
 const source=fs.readFileSync(root+'user-burgundy-pages.js','utf8');
 assert.match(source,/key==='otp'/);assert.match(source,/Payment details \/ submit transfer reference/);assert.match(source,/extra\.append\(item\)/);assert.match(source,/more\.append\(node\)/);
 assert.match(source,/amount\.addEventListener\('input',update\)/);assert.match(source,/history\.open=true/);assert.match(source,/root\.WPayReferenceUi\?\.select\(topic\[0\]\)/);
 assert.doesNotMatch(source,/fetch\(|\.post\(|innerHTML\s*=|localStorage|sessionStorage/);
 const html=fs.readFileSync(root+'user-live.html','utf8');assert.match(html,/user-deposit-qr\.js/);
 for(const panel of ['admin.html','merchant.html'])assert.doesNotMatch(fs.readFileSync(root+panel,'utf8'),/user-deposit-qr\.js/);
});

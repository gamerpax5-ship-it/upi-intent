"use strict";
// Explicit installed-package acceptance; no mocks and no secret-bearing artifacts.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {inflateSync}=require('node:zlib');
const {MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
const {otp}=require('../lib/wpay/auth/runtime/dependencies').load();
// Independent decoder from an already declared, frozen root dependency.
const ZXing=require('html5-qrcode/third_party/zxing-js.umd.js');
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // Public RFC 6238 Appendix B SHA-1 seed.
test('installed otplib matches all six RFC 6238 SHA-1 reference vectors',async()=>{
  const crypto=new MfaCrypto(Buffer.alloc(32,1));
  for(const [epoch,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]){
    assert.equal(await otp.generate({secret,epoch,digits:8,period:30,algorithm:'sha1'}),expected);
    const step=Math.floor(epoch/30);
    assert.equal(await crypto.verify(secret,expected.slice(-6),epoch*1000,null),step);
    assert.equal(await crypto.verify(secret,expected.slice(-6),epoch*1000,step),null);
  }
  assert.equal(await crypto.verify(secret,'287082',120000,null),null,'expired reference code');
  assert.equal(await crypto.verify(secret,'287082',0,null),null,'future reference code');
});
// Decode the actual emitted PNG using built-in PNG scanline reconstruction.
// QR recognition is independently performed by ZXing, not by the generator.
function pngLuminance(url){
  const png=Buffer.from(url.replace(/^data:image\/png;base64,/,''),'base64');
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let width,height,chunks=[];
  for(let pos=8;pos<png.length;){const length=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8),data=png.subarray(pos+8,pos+8+length);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(type==='IDAT')chunks.push(data);pos+=12+length;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(height*stride),lum=new Uint8ClampedArray(width*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];assert.ok(filter<=4);for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;pixels[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}for(let x=0;x<width;x++)lum[y*width+x]=pixels[y*stride+x*4];}
  return {width,height,lum};
}
test('actual qrcode PNG independently decodes to the intended authenticator configuration',async()=>{
  const crypto=new MfaCrypto(Buffer.alloc(32,1)),setup=await crypto.setup(secret,'synthetic-reference@example.invalid');
  const {width,height,lum}=pngLuminance(setup.qrDataUrl);
  const result=new ZXing.QRCodeReader().decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(lum,width,height))));
  const uri=new URL(result.getText());
  assert.equal(uri.protocol,'otpauth:');assert.equal(uri.hostname,'totp');
  assert.ok(decodeURIComponent(uri.pathname).includes('synthetic-reference@example.invalid'));
  for(const [key,value]of Object.entries({issuer:'WPay Development',secret}))assert.equal(uri.searchParams.get(key),value);
  // Key URI Format specifies these defaults; otplib intentionally omits them.
  // https://github.com/google/google-authenticator/wiki/Key-Uri-Format
  for(const [key,value]of Object.entries({digits:'6',period:'30',algorithm:'SHA1'}))assert.equal(uri.searchParams.get(key) ?? value,value);
  assert.equal(setup.setupKey,secret);assert.ok(width>=116);assert.equal(width%4,0);assert.equal(height,width);
});

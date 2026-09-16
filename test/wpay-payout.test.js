"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const input=require('../lib/wpay/payouts/validation'),uploads=require('../lib/wpay/payouts/uploads'),{Payouts}=require('../lib/wpay/payouts/core');
const XLSX=require('../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js');
const headers=['reference','beneficiaryName','accountNumber','ifsc','amountINR','note'],row=['synthetic-1','Synthetic Beneficiary','123456780001','TEST0000001','123.45','Synthetic note'];
const body={reference:'synthetic-1',idempotencyKey:'synthetic-key',beneficiaryName:'Synthetic Beneficiary',accountNumber:'123456780001',ifsc:'TEST0000001',amountMinor:'12345',note:''};
test('payout input rejects forged authority, incorrect money and unsafe beneficiary fields',()=>{
 assert.equal(input.order(body).amountMinor,'12345');for(const key of ['userId','merchantId','bankId','status','commission','rate','approved'])assert.throws(()=>input.order({...body,[key]:'forged'}));
 for(const amountMinor of ['0','-1','1.1',1,'01','1e3'])assert.throws(()=>input.order({...body,amountMinor}));
 for(const accountNumber of ['123',123456780001,'<script>'])assert.throws(()=>input.order({...body,accountNumber}));
 for(const ifsc of ['test0000001','12345678901'])assert.throws(()=>input.order({...body,ifsc}));assert.throws(()=>input.order({...body,note:'a'.repeat(301)}));
});
test('bulk parser accepts exact CSV, XLS and XLSX templates without using the statement algorithm',async()=>{
 const core=new Payouts({});for(const extension of ['csv','xls','xlsx']){
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,row]),'Payouts');
  const data=extension==='csv'?Buffer.from([headers.join(','),row.join(',')].join('\n')):Buffer.from(XLSX.write(book,{bookType:extension,type:'buffer'}));
  const result=await core.prepare('payout/bulk',{idempotencyKey:'batch',file:{name:'synthetic.'+extension,data:data.toString('base64')}});assert.equal(result.errors.length,0);assert.equal(result.orders.length,1);assert.equal(result.orders[0].amountMinor,'12345');assert.equal(result.orders[0].accountNumber,'123456780001');
 }
});
test('bulk row errors are explicit and contain no raw beneficiary contents',async()=>{
 const core=new Payouts({}),bytes=Buffer.from([headers.join(','),row.join(','),row.join(','),['invalid','Synthetic','12','bad','0',''].join(',')].join('\n'));
 const result=await core.prepare('payout/bulk',{idempotencyKey:'batch',file:{name:'synthetic.csv',data:bytes.toString('base64')}});assert.deepEqual(result.errors.map(e=>e.row),[3,4]);assert.equal(JSON.stringify(result.errors).includes('123456780001'),false);
});
test('bulk files reject excess rows, wrong templates, formulas and links',async()=>{
 const bad=[Buffer.from('wrong,headers\n1,2'),Buffer.from([headers.join(','),...Array(101).fill(row.join(','))].join('\n'))];for(const bytes of bad)await assert.rejects(uploads.bulk({name:'bad.csv',data:bytes.toString('base64')}));
 for(const prop of ['f','l']){const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([headers,row]);sheet.A2[prop]=prop==='f'?'1+1':{Target:'https://example.invalid/private'};XLSX.utils.book_append_sheet(book,sheet,'Payouts');await assert.rejects(uploads.bulk({name:'bad.xlsx',data:Buffer.from(XLSX.write(book,{bookType:'xlsx',type:'buffer'})).toString('base64')}));}
});
test('proof boundary enforces byte limit, format signatures, safe names and scanner result',async()=>{
 const file={name:'synthetic.pdf',data:Buffer.from('%PDF-1.4\nSynthetic proof only\n%%EOF').toString('base64')};
 assert.equal((await uploads.proof(file)).scanState,'unscanned');assert.equal((await uploads.proof(file,async bytes=>{assert.ok(Buffer.isBuffer(bytes));return 'clean';})).scanState,'clean');
 await assert.rejects(uploads.proof(file,async()=> 'infected'),e=>e.code==='UPLOAD_REJECTED');
 for(const name of ['../proof.pdf','proof.exe','proof.html','proof.svg','C:\\proof.pdf'])await assert.rejects(uploads.proof({...file,name}));
 await assert.rejects(uploads.proof({...file,data:Buffer.from('<script>private</script>').toString('base64')}));await assert.rejects(uploads.proof({...file,data:Buffer.alloc(1048577).toString('base64')}));
});

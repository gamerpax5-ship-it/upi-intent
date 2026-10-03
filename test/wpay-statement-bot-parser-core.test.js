'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseRows}=require('../lib/wpay/statement-bot/parser-core');

const rows=input=>input.map((cells,index)=>({cells,text:cells.filter(Boolean).join(' '),source:'fixture',index}));
const byUtr=(parsed,utr)=>parsed.transactions.find(x=>x.utr===utr);

test('Statement Bot parser handles explicit PNB-style Amount + DR/CR rows',()=>{
 const parsed=parseRows(rows([
  ['Date','Instrument ID','Amount(INR)','Type','Balance','Remarks'],
  ['04/08/2026','','12200.0','CR','12758.05','UPI/CR/621628601452/RAJESH B/SBIN/rajeshnasare100/'],
  ['04/08/2026','','145.0','DR','12501.05','UPI/DR/621660004850/Jai Ambe/YESB/q308826557@ybl/U']
 ]));
 assert.equal(byUtr(parsed,'621628601452').direction,'credit');assert.equal(byUtr(parsed,'621628601452').amount,'12200.00');
 assert.equal(byUtr(parsed,'621660004850').direction,'debit');assert.equal(byUtr(parsed,'621660004850').amount,'145.00');
});

test('Statement Bot parser joins Central Bank-style multiline RRN narration and separate Debit/Credit columns',()=>{
 const parsed=parseRows(rows([
  ['Post Date','Value Date','Branch Code','Cheque Number','Account Description','Debit','Credit','Balance'],
  ['01/07/2026','01/07/2026','04982','','UPI/RRN','-711.00','','4,622.50 CR'],
  ['','','','','618263559702/Sent using','','',''],
  ['','','','','Paytm UPI','','',''],
  ['02/07/2026','02/07/2026','04982','','UPI/RRN','','10,000.00','13,097.50 CR'],
  ['','','','','654903413777/UPI_RAVIND','','','']
 ]));
 assert.equal(byUtr(parsed,'618263559702').direction,'debit');assert.equal(byUtr(parsed,'618263559702').amount,'711.00');
 assert.equal(byUtr(parsed,'654903413777').direction,'credit');assert.equal(byUtr(parsed,'654903413777').amount,'10000.00');
});

test('Statement Bot parser handles Withdrawal/Deposit bank layouts',()=>{
 const parsed=parseRows(rows([
  ['Transaction Date','Remarks','Ref. No.','Cheque No.','Withdraw','Deposit','Closing Balance'],
  ['28/06/2026','CIB203366791-NEFT-S K TRADERS','S7286266','','','1,13,010.00','1,51,45,384.00'],
  ['28/06/2026','ATM WDR 123456789012','S7286267','','500.00','','1,51,44,884.00']
 ]));
 assert.equal(parsed.transactions[0].direction,'credit');assert.equal(parsed.transactions[0].amount,'113010.00');
 assert.equal(parsed.transactions[1].direction,'debit');assert.equal(parsed.transactions[1].amount,'500.00');
});

test('Statement Bot parser handles BOI-style Cr/Dr marker with a single Amount column',()=>{
 const parsed=parseRows(rows([
  ['Date','Description','Inst-No','Cr/Dr','Amount','Balance'],
  ['23-04-2026','UPI/631387936099/CR/SAGAR/RAT','','Cr','9,723.00','1,01,979.39'],
  ['23-04-2026','IBRTGS/KSBK/SR FRUIT AND VEGET','','Dr','2,09,900.00','91,097.39']
 ]));
 assert.equal(byUtr(parsed,'631387936099').direction,'credit');assert.equal(byUtr(parsed,'631387936099').amount,'9723.00');
 assert.equal(parsed.transactions.find(x=>x.direction==='debit').amount,'209900.00');
});

test('Statement Bot parser handles Axis-style Amount plus Debit/Credit indicator',()=>{
 const parsed=parseRows(rows([
  ['Transaction Date (dd/mm/yyyy)','Value Date (dd/mm/yyyy)','Particulars','Amount(INR)','Debit/Credit','Balance(INR)'],
  ['04/12/2025','04/12/2025','IMPS/P2A/533818843778/Test','100.00','DR','18,216.10'],
  ['04/12/2025','04/12/2025','IMPS/P2A/533800157249/Deposit','1,02,000.00','CR','1,20,116.10']
 ]));
 assert.deepEqual(parsed.transactions.map(x=>[x.direction,x.amount]),[['debit','100.00'],['credit','102000.00']]);
});

test('Statement Bot parser repairs PDF/table extraction drift where balance lands in Deposit column',()=>{
 const parsed=parseRows(rows([
  ['Date','Particulars','Withdrawals','Deposits','Balance'],
  ['19/03/2026','IMPS/P2A/607813136431/XXXXXXXXXX8623/0','299923.6','2453.35',''],
  ['19/03/2026','UPI/CR/607824773677/NITIN R/SBIN/9424461442/KSN3','','6000.00 302376.95','']
 ]));
 assert.equal(parsed.transactions[0].direction,'debit');assert.equal(parsed.transactions[0].amount,'299923.60');
 assert.equal(byUtr(parsed,'607824773677').direction,'credit');assert.equal(byUtr(parsed,'607824773677').amount,'6000.00');
});

test('Statement Bot parser uses narration tokens and balance movement only as fallbacks',()=>{
 const parsed=parseRows(rows([
  ['Date','Description','Amount','Balance'],
  ['14/12/2025','NEFT_OUT:PUNBN62025121456687398/LAHIZ','1,00,000.00','114.76 Cr.'],
  ['14/12/2025','UPI/CR/289575460275/JAMEEL A/UBIN','806','1,00,114.76 Cr.']
 ]));
 assert.equal(parsed.transactions[0].direction,'debit');assert.equal(parsed.transactions[0].amount,'100000.00');
 assert.equal(byUtr(parsed,'289575460275').direction,'credit');assert.equal(byUtr(parsed,'289575460275').amount,'806.00');
});

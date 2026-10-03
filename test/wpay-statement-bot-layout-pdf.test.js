'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {textToRows}=require('../lib/wpay/statement-bot/parser-worker');
const {parseRows}=require('../lib/wpay/statement-bot/parser-core');

function parse(text){return parseRows(textToRows(text)).transactions;}
function byText(tx,needle){return tx.find(x=>x.text.includes(needle));}

test('layout-aware PDF parser keeps IDFC Debit and Credit columns distinct when blank columns collapse',()=>{
 const text=[
 '   Transaction                                                           Cheque',
 '                       Value Date               Particulars                            Debit                   Credit             Balance',
 '      Date                                                                 No',
 '                                         NEFT/',
 '                                         IDFB6260M0604275/ALL',
 ' 17-Sep-2026        17-Sep-2026                                                                  13.00                                    2,010.43',
 '                                         INDIA SABILE HUSSAIN',
 '                                         TRUST/UTIB0004298',
 '                                         RTGS/',
 '                                         BARBR52026091700963671/',
 ' 17-Sep-2026        17-Sep-2026                                                                                10,00,000.00        10,01,995.43',
 '                                         ILABEN GOPALBHAI'
 ].join('\n');
 const tx=parse(text);
 assert.equal(byText(tx,'IDFB6260M0604275').direction,'debit');
 assert.equal(byText(tx,'IDFB6260M0604275').amount,'13.00');
 assert.equal(byText(tx,'BARBR52026091700963671').direction,'credit');
 assert.equal(byText(tx,'BARBR52026091700963671').amount,'1000000.00');
});

test('layout-aware PDF parser separates IDBI Withdrawals and Deposits for UPI and IMPS return rows',()=>{
 const text=[
 '                                                                                                                    Withdrawals         Deposits             Balance',
 '      S.No         Txn Date             Value Date                  Description                  Cheque No              (Dr)              (Cr)                (INR)',
 '        1      28/09/2026 20:48:51       28/09/2026      IMPS/627120142101/8221/UTIB/XX                               77000.00                           384.99',
 '                                                         8221/No Rem',
 '        2      28/09/2026 20:47:29       28/09/2026      Return-                                                                         40000.00        77384.99',
 '                                                         IMPS/627120142052/2963/BANK',
 '                                                         NOT REGI/XX2963',
 '        4      28/09/2026 20:30:13       28/09/2026      UPI/691662123100/AJIT SANJAY                                                    46799.44        77384.99',
 '                                                         VADEKAR'
 ].join('\n');
 const tx=parse(text);
 assert.equal(byText(tx,'627120142101').direction,'debit');
 assert.equal(byText(tx,'627120142101').amount,'77000.00');
 assert.equal(byText(tx,'Return-').direction,'credit');
 assert.equal(byText(tx,'Return-').amount,'40000.00');
 const upi=byText(tx,'691662123100');assert.equal(upi.direction,'credit');assert.equal(upi.amount,'46799.44');assert.equal(upi.isUpi,true);assert.equal(upi.utr,'691662123100');
});

test('layout-aware PDF parser honors Axis Amount plus explicit DR CR marker',()=>{
 const text=[
 'S.NO    Transaction    Value Date     Particulars                         Amount(INR)      Debit/Credit        Balance(INR)                 Cheque   Branch Name(SOL)',
 '        Date           (dd/mm/yyyy)                                                                                                         Number',
 '                                      NEFT/1001i30072456621/ANIL KUMAR             13.00                  CR                  2,49,086.27                    BIJNOR [UP] (248)',
 '1       01/10/2026     01/10/2026     THAKUR/IDBI BANK/SL////BL//NO',
 '                                      INB/NEFT/AXODH27436688924/Aarti              11.00                  DR                  2,49,075.27                   BIJNOR [UP] (1092)',
 '2       01/10/2026     01/10/2026     Rawat/STATE BANK OF INDIA//////'
 ].join('\n');
 const tx=parse(text);
 assert.equal(byText(tx,'1001i30072456621').direction,'credit');
 assert.equal(byText(tx,'1001i30072456621').amount,'13.00');
 assert.equal(byText(tx,'AXODH27436688924').direction,'debit');
 assert.equal(byText(tx,'AXODH27436688924').amount,'11.00');
});

test('layout-aware PDF parser honors Federal D C transaction type and Withdrawals Deposits columns',()=>{
 const text=[
 '                                                                                   Tran       Cheque',
 '    Date           Value Date                         Particulars                                            Withdrawals      Deposits    Balance',
 '                                                                                   Type       Details',
 '    27-AUG-         27-AUG-26      FT IMPS/IFO/623908306205/CBIN0280074/123123          D                             18                        699.12',
 '        2026       08:48:35 AM',
 '    27-AUG-         27-AUG-26                                 RTG/SRINIVAS              C                                       600000       600665.12',
 '        2026       10:12:28 AM          GALAGA/ICICR12026082712483483/ICICI B'
 ].join('\n');
 const tx=parse(text);
 assert.equal(byText(tx,'623908306205').direction,'debit');
 assert.equal(byText(tx,'623908306205').amount,'18.00');
 assert.equal(byText(tx,'RTG/SRINIVAS').direction,'credit');
 assert.equal(byText(tx,'RTG/SRINIVAS').amount,'600000.00');
});

'use strict';
const XLS_MAGIC=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
function starts(buf,magic){return buf.length>=magic.length&&buf.subarray(0,magic.length).equals(magic);}
function magic(bytes){const b=Buffer.from(bytes),head=b.subarray(0,Math.min(b.length,1024));if(head.indexOf(Buffer.from('%PDF-'))>=0)return 'pdf';if(starts(b,XLS_MAGIC))return 'xls';if(b.length>=4&&b[0]===0x50&&b[1]===0x4b&&b[2]===0x03&&b[3]===0x04)return 'zip';return 'text';}
function textual(bytes){const b=Buffer.from(bytes);if(!b.length)return false;const sample=b.subarray(0,Math.min(b.length,65536));if(sample.includes(0))return false;let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(sample);}catch{return false;}const lines=text.split(/\r?\n/).filter(Boolean);if(lines.length<2)return false;return lines.slice(0,20).some(line=>/[,;\t|]/.test(line));}
async function detect(bytes,{probePdf,probeWorkbook}={}){
 const kind=magic(bytes);
 if(kind==='pdf'){if(typeof probePdf!=='function'||await probePdf(bytes)!==true)throw Error('INVALID_PDF');return 'pdf';}
 if(kind==='xls'){if(typeof probeWorkbook!=='function'||await probeWorkbook(bytes,'xls')!==true)throw Error('INVALID_XLS');return 'xls';}
 if(kind==='zip'){if(typeof probeWorkbook!=='function'||await probeWorkbook(bytes,'xlsx')!==true)throw Error('INVALID_XLSX');return 'xlsx';}
 if(kind==='text'&&textual(bytes)){if(typeof probeWorkbook!=='function'||await probeWorkbook(bytes,'csv')!==true)throw Error('INVALID_CSV');return 'csv';}
 throw Error('UNSUPPORTED_FILE');
}
module.exports={detect,magic,textual};

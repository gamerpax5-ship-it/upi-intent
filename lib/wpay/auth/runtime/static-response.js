"use strict";
const {gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
function asset(bytes,type){return {bytes,type,gzip:gzipSync(bytes),etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};}
function serve(req,res,entry,cache=false){
 res.setHeader('Content-Type',entry.type+'; charset=utf-8');res.setHeader('Vary','Accept-Encoding');
 if(cache){res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',entry.etag);if(req.headers['if-none-match']===entry.etag){res.statusCode=304;return res.end();}}
 const accepts=(req.headers['accept-encoding']||'').split(',').some(v=>/^\s*gzip\s*(?:;\s*q=(?:1(?:\.0*)?|0\.[0-9]*[1-9][0-9]*))?\s*$/i.test(v));
 const bytes=accepts?entry.gzip:entry.bytes;if(accepts)res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',bytes.length);res.statusCode=200;res.end(bytes);
}
module.exports={asset,serve};

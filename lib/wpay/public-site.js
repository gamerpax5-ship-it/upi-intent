"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
// Only the supplied, hash-pinned HTML and assets are publicly addressable.
async function loadPublicSite(){
 const root=path.join(__dirname,'../../dev/wpay-public-site'),manifest=JSON.parse(await fs.readFile(path.join(root,'source-manifest.json'),'utf8')),assets=new Map();
 for(const item of manifest.files){
  if(!/^(index\.html|assets\/[a-f0-9]+\.(png|svg))$/.test(item.path))throw Error('WPAY_PUBLIC_ASSET_INVALID');
  const bytes=await fs.readFile(path.join(root,item.path));if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('WPAY_PUBLIC_ASSET_CHANGED');
  assets.set('/'+item.path,{bytes,type:item.path.endsWith('.html')?'text/html; charset=utf-8':item.path.endsWith('.svg')?'image/svg+xml':'image/png'});
 }
 const html=assets.get('/index.html');if(!html)throw Error('WPAY_PUBLIC_SITE_MISSING');assets.set('/',html);
 const scripts=[...html.bytes.toString('utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");
 return function serve(req,res){
  if(req.method!=='GET'||/[\\%#]/.test(req.url))return false;
  const url=new URL(req.url,'http://localhost'),asset=assets.get(url.pathname);if(!asset)return false;
  res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src "+scripts.join(' ')+"; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control',url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  res.setHeader('Content-Type',asset.type);res.setHeader('Content-Length',asset.bytes.length);res.statusCode=200;res.end(asset.bytes);return true;
 };
}
module.exports={loadPublicSite};

'use strict';
const EMAIL=/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
function parse(text,username=''){
 if(typeof text!=='string')return null;
 const m=/^\/adduser(?:@([A-Za-z0-9_]{5,32}))?\s+([^\s]{3,320})\s*$/.exec(text);
 if(!m)return null;
 if(m[1]&&username&&m[1].toLowerCase()!==username.toLowerCase())return null;
 const email=m[2].trim().toLowerCase();if(!EMAIL.test(email))throw Error('INVALID_EMAIL');
 return {command:'adduser',email};
}
module.exports={parse,EMAIL};
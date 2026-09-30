'use strict';
const DEFAULT_CONTROLLER_IDS=Object.freeze(['8248339578','8431990409','7925279541','8403294379','7668086423','6749918659']);
function parseControllers(value){const ids=String(value||'').split(',').map(x=>x.trim()).filter(Boolean);const out=ids.length?ids:[...DEFAULT_CONTROLLER_IDS];if(out.some(id=>!/^[1-9][0-9]{0,15}$/.test(id))||new Set(out).size!==out.length)throw Error('INVALID_CONTROLLER_IDS');return out;}
function isController(ids,id){return ids.includes(String(id));}
module.exports={DEFAULT_CONTROLLER_IDS,parseControllers,isController};
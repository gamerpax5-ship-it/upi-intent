'use strict';
const CONTROLLER_IDS=Object.freeze(['8248339578','8431990409','7925279541','8403294379','7668086423','6749918659']);
function isController(id){return CONTROLLER_IDS.includes(String(id));}
module.exports={CONTROLLER_IDS,isController};
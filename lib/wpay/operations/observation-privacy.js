"use strict";
// Generic device/statement observations are not the User's routed transaction
// history. Keep payment references out of these older panel surfaces.
function forPanel(role,result){
 if(role!=='user'||!Array.isArray(result.rows))return result;
 return {...result,rows:result.rows.map(row=>{const projected={...row};delete projected.utr;delete projected.submitted_utr;return projected;})};
}
module.exports={forPanel};

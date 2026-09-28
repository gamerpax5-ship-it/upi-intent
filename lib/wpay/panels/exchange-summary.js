'use strict';
const money=require('../business/money');
// Value each transfer at its immutable account-rate snapshot, never today's rate.
function totals(rows){
 let usdt=0n,scaledInr=0n,capacity=0n;
 for(const row of rows){const amount=BigInt(row.usdt);usdt+=amount;scaledInr+=amount*BigInt(money.fromDecimal(row.rate,'USDT'));capacity+=BigInt(row.capacity||0);}
 return {usdt:usdt.toString(),inr:(scaledInr/10000000000n).toString(),capacity:capacity.toString()};
}
function summarize(fundingRows,settlementRows){
 const funding=totals(fundingRows),settlement=totals(settlementRows);
 return {funding,settlement,fxProfit:(BigInt(settlement.inr)-BigInt(funding.inr)).toString(),fxBasis:'aggregate-locked-account-rates'};
}
module.exports={totals,summarize};

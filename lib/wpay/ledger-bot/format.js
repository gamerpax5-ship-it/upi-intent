'use strict';
const money=require('./money');
const clean=v=>v===null||v===undefined||v===''?'Unavailable':String(v).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,220);
const when=v=>{const d=new Date(v);return v&&Number.isFinite(+d)?d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})+' IST':'Unavailable';};
const line=(k,v)=>`${k}: ${clean(v)}`;
function account(a){return [line('Name',a.name),line('Email',a.email),line('Role',a.account_type),line('Account status',a.status),line('Approval',a.approval_status||'n/a'),line('Account ID',a.id)].join('\n');}
function userSummary(d){return [
 'USER SUMMARY',line('Name',d.account.name),line('Email',d.account.email),'',
 line('Available Capacity',money.inr(d.capacity.available)),line('Allocated Capacity',money.inr(d.capacity.allocated)),line('Consumed Capacity',money.inr(d.capacity.consumed)),line('Reserved Capacity',money.inr(d.capacity.reserved)),line('Capacity Hold',money.inr(d.capacity.held)),line('Collection access',d.collectionAccess?.unlimited_collection?'Unlimited':'Capacity based'),'',
 line('Today Collection',money.inr(d.payins.today_volume)),line('Collection Volume',money.inr(d.payins.volume)),line('Payout Volume',money.inr(d.payouts?.volume||0)),line('Parking Completed Volume',money.inr(d.parking?.volume||0)),line('Total Volume',money.inr(d.totalVolumeMinor||BigInt(d.payins?.volume||0)+BigInt(d.payouts?.volume||0)+BigInt(d.parking?.volume||0))),line('Successful Pay-ins',d.payins?.successful||0),line('Successful Payouts',d.payouts?.successful||0),line('Pending Pay-ins',d.payins.pending),line('Failed Pay-ins',d.payins.failed),'',
 line('Available Commission',money.inr(d.commission?.available||0)),line('Total Commission',money.inr(d.commission?.gross||0)),line('Running UPI',d.runningUpi),line('Confirmed USDT',money.usdt(d.deposits.usdt_minor||0))
 ].join('\n');}
function merchantSummary(d){return [
 'MERCHANT SUMMARY',line('Name',d.account.name),line('Email',d.account.email),'',
 line('Available Balance',money.inr(d.balance.merchantAvailable)),line('Gross',money.inr(d.balance.gross)),line('Frozen',money.inr(d.frozen)),line('Hold',money.inr(d.hold)),line('Payout Reserved',money.inr(d.balance.merchantPayoutReserved)),line('Settlement Reserved',money.inr(d.balance.merchantSettlementReserved)),'',
 line('Collection Volume',money.inr(d.gateway.successfulVolumeMinor)),line('Payout Volume',money.inr(d.successfulPayoutVolumeMinor)),line('Total Volume',money.inr(d.totalVolumeMinor)),line('Successful Orders',d.gateway.counts.successful||0),line('Pending Orders',(d.gateway.counts.pending_payment||0)+(d.gateway.counts.verification_pending||0)),line('Failed Orders',d.gateway.counts.failed||0),line('Success Rate',money.ratioPercent(d.gateway.counts.successful,d.gateway.counts.failed)),'',
 line('Platform Fees',money.inr(d.balance.fees)),line('Payout Fees',money.inr(d.balance.payoutFees)),line('INR/USDT Rate',d.terms?.settings?.inrPerUsdt?`₹${d.terms.settings.inrPerUsdt}`:'Unavailable')
 ].join('\n');}
function adminSummary(d){return [
 'ADMIN SUMMARY',line('Scope',d.scopeLabel),'',
 line('Merchant Available',money.inr(d.merchantAvailable)),line('Merchant Frozen / Reserved',money.inr(d.frozen)),line('Settlement Principal',money.inr(d.settlement)),'',
 line('Total User Capacity',money.inr(d.totalUserCapacity)),line('User Consumed Capacity',money.inr(d.userConsumedCapacity)),line('User Reserved Capacity',money.inr(d.userReservedCapacity)),line('User Held Capacity',money.inr(d.userHeldCapacity)),line('User Available Capacity',money.inr(d.userAvailableCapacity)),line('Total User Commission',money.inr(d.totalUserCommission)),'',
 line('Total Fees',money.inr(d.totalFees)),line('Today Fees',money.inr(d.todayFees)),line('Today User Commission',money.inr(d.todayUserCommission)),'',
 line('Today Collection',money.inr(d.todayCollection)),line('Today Payout',money.inr(d.todayPayoutVolume)),line('Total Volume',money.inr(d.totalVolume)),line('Running UPI',d.runningUpi),line('Available UPI',d.availableUpi)
 ].join('\n');}
function ledger(rows){if(!rows.length)return 'No ledger entries found.';return rows.map(r=>[when(r.created_at),...(r.owner_name?[line('Owner',r.owner_name)]:[]),`${clean(r.ledger_type)} · ${clean(r.direction)}`,money.inr(r.amount_minor),`Reference: ${clean(r.reference_id||r.reference_type)}`].join('\n')).join('\n\n');}
function holds(rows){if(!rows.length)return 'No active hold/frozen records.';return rows.map(r=>[...(r.owner_name?[line('Owner',r.owner_name)]:[]),line('Type',r.category),line('Amount',money.inr(r.amount_minor)),line('Reference',r.reference),line('Reason',r.reason),line('State',r.state),line('Created',when(r.created_at))].join('\n')).join('\n\n');}
function upis(rows){if(!rows.length)return 'No UPI routes found for this account/scope.';return rows.map(r=>[line('UPI',r.upi_id),line('Owner',r.owner_name||r.owner_id),line('Status',r.deactivated?'deactivated':r.frozen?'frozen':r.status),line('Daily Limit',money.inr(r.shared_limit||r.daily_limit_minor||0)),line('Used',money.inr(r.used||0)),line('Remaining',money.inr(r.remaining||0)),line('Successful Volume',money.inr(r.volume||0)),line('Successful Orders',r.successful||0)].join('\n')).join('\n\n');}
function rows(title,records,mapper){if(!records?.length)return `${title}\nNo records found.`;return title+'\n\n'+records.map(mapper).join('\n\n');}
function split(text,max=3500){const s=String(text||'');if(s.length<=max)return [s];const out=[];let rest=s;while(rest.length>max){let cut=rest.lastIndexOf('\n\n',max);if(cut<max/2)cut=rest.lastIndexOf('\n',max);if(cut<max/2)cut=max;out.push(rest.slice(0,cut));rest=rest.slice(cut).replace(/^\s+/,'');}if(rest)out.push(rest);return out;}
module.exports={clean,when,line,account,userSummary,merchantSummary,adminSummary,ledger,holds,upis,rows,split};
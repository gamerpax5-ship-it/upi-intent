'use strict';
const {parse,allowedForRole}=require('./commands');
const {isController}=require('./access');
const fmt=require('./format'),money=require('./money');
const roleOf=a=>a.account_type;
const line=fmt.line;
class Bot{
 constructor({telegram,store,source,username,controllerIds}){Object.assign(this,{telegram,store,source,username,controllerIds});}
 async send(chat,text){for(const part of fmt.split(text))await this.telegram.text(chat.id,part);}
 async bound(chat){const b=await this.store.binding(chat.id);if(!b)throw Error('GROUP_NOT_BOUND');return {binding:b,account:await this.source.account(b.account_id)};}
 help(role){
  const setup=`SETUP\n/connectuser EMAIL\n/connectmerchant EMAIL\n/connectadmin EMAIL\n/switchuser EMAIL\n/switchmerchant EMAIL\n/unsetaccount\n/account\n/accountstatus\n/groupinfo\n/whoami`;
  const common=`FINANCE\n/summary\n/balance\n/today\n/recent\n/volume [1d|7d|30d|all]\n/analytics\n/ledger [1-50|capacity|commission|fees|holds|payout]\n/holds\n/frozen\n/reserved\n/upi\n/rates\n/usdt\n/withdrawals\n/payins\n/payouts\n/health\n/alerts\n/refresh`;
  if(role==='user')return `${setup}\n\n${common}\n\nUSER\n/capacity\n/upi [UPI_ID]\n/upivolume UPI_ID\n/limits\n/commission\n/commissionrate\n/deposits\n/depositaddress\n/parking`;
  if(role==='merchant')return `${setup}\n\n${common}\n\nMERCHANT\n/available\n/fees\n/feerate\n/settlement`;
  if(role==='admin'||role==='super_admin')return `${setup}\n\n${common}\n/upi [UPI_ID]\n/upivolume UPI_ID\n/limits\n\nADMIN\n/user EMAIL\n/merchant EMAIL\n/topusers\n/topmerchants\n/platform\n/platformfees\n/platformcapacity\n/commission\n/fees`;
  return setup+'\n\nBind this group first, then /help shows role-specific commands.';
 }
 async command(message,updateId){
  if(!message?.from||message.from.is_bot||message.sender_chat||message.forward_origin||!['group','supergroup'].includes(message.chat?.type)||!Number.isSafeInteger(message.chat?.id)||message.chat.id>=0||!isController(this.controllerIds,message.from.id))return;
  let input;try{input=parse(message.text,this.username);}catch(e){await this.send(message.chat,'Invalid command: '+e.message);return;}
  if(!input)return;if(await this.store.processed(updateId))return;
  const c=input.command;
  if(c==='whoami'){await this.send(message.chat,`Telegram ID: ${message.from.id}\nAuthorized controller: Yes`);return this.store.markProcessed(updateId);}
  if(['connectuser','connectmerchant','connectadmin','switchuser','switchmerchant'].includes(c)){
   const account=await this.source.accountByEmail(input.email,input.targetType);if(input.targetType==='admin')await this.source.adminTenants(account);await this.store.bind(message.chat,account,message.from.id);await this.send(message.chat,`Group linked.\n${fmt.account(account)}\n\nUse /summary or /help.`);return this.store.markProcessed(updateId);
  }
  if(c==='unsetaccount'){await this.store.unbind(message.chat.id);await this.send(message.chat,'WPay account binding removed from this group.');return this.store.markProcessed(updateId);}
  if(c==='help'){
   const b=await this.store.binding(message.chat.id);await this.send(message.chat,this.help(b?.account_type));return this.store.markProcessed(updateId);
  }
  const {binding,account}=await this.bound(message.chat);if(!allowedForRole(c,roleOf(account)))throw Error('COMMAND_NOT_ALLOWED_FOR_ROLE');
  if(c==='account'){await this.send(message.chat,fmt.account(account));}
  else if(c==='accountstatus'){await this.accountStatus(message.chat,account);}
  else if(c==='groupinfo'){await this.send(message.chat,[line('Group ID',binding.chat_id),line('Bound account',binding.email),line('Role',binding.account_type),line('Bound by Telegram ID',binding.bound_by),line('Bound at',fmt.when(binding.bound_at))].join('\n'));}
  else if(['summary','refresh'].includes(c)){const d=await this.source.summary(account);await this.send(message.chat,account.account_type==='user'?fmt.userSummary(d):account.account_type==='merchant'?fmt.merchantSummary(d):fmt.adminSummary(d));}
  else if(c==='balance'||c==='capacity'||c==='available')await this.balance(message.chat,account,c);
  else if(c==='today'){await this.today(message.chat,account);}
  else if(c==='volume'){const d=await this.source.volume(account,input.window);await this.send(message.chat,this.volumeText(d));}
  else if(c==='recent'){const rows=await this.source.recent(account);await this.send(message.chat,fmt.rows('RECENT ACTIVITY',rows,r=>`${fmt.when(r.at)}\n${line('Type',r.kind)}${r.merchant_name?'\n'+line('Merchant',r.merchant_name):''}\n${line('Reference',r.reference)}\n${line('Amount',money.inr(r.amount_minor))}\n${line('Status',r.state||r.claim_state)}`));}
  else if(c==='analytics')await this.analytics(message.chat,account);
  else if(c==='ledger'){if(account.account_type==='user'&&input.filter==='fees'||account.account_type==='merchant'&&['capacity','commission'].includes(input.filter))throw Error('COMMAND_NOT_ALLOWED_FOR_ROLE');await this.send(message.chat,fmt.ledger(await this.source.ledger(account,{limit:input.limit,filter:input.filter})));}
  else if(c==='holds'){await this.send(message.chat,fmt.holds((await this.source.holds(account)).filter(x=>x.state==='active')));}
  else if(c==='frozen'){await this.send(message.chat,fmt.holds((await this.source.holds(account,{category:'frozen'})).filter(x=>x.state==='active')));}
  else if(c==='reserved')await this.reserved(message.chat,account);
  else if(c==='upi'){if(account.account_type==='merchant'){if(input.upi)throw Error('COMMAND_NOT_ALLOWED_FOR_ROLE');const d=await this.source.merchantUpiSummary(account);await this.send(message.chat,[line('Collection routing','Private User UPI/bank details are not exposed'),line('Active assigned routes',d.routeCount),line('Successful orders',d.successful),line('Pending orders',d.pending),line('Failed orders',d.failed),line('Successful collection volume',money.inr(d.volume))].join('\n'));}else await this.send(message.chat,fmt.upis(await this.source.upis(account,input.upi||null)));}
  else if(c==='upivolume'){const d=await this.source.upiVolume(account,input.upi,'all');await this.send(message.chat,[line('UPI',d.upi_id),line('Owner',d.owner_name),line('Successful volume',money.inr(d.volume)),line('Successful orders',d.successful),line('Daily used',money.inr(d.used)),line('Daily limit',money.inr(d.shared_limit)),line('Remaining',money.inr(d.remaining))].join('\n'));}
  else if(c==='limits'){const rows=await this.source.upis(account);await this.send(message.chat,fmt.rows('UPI LIMITS',rows,r=>`${line('UPI',r.upi_id)}\n${line('Limit',money.inr(r.shared_limit))}\n${line('Used',money.inr(r.used))}\n${line('Remaining',money.inr(r.remaining))}`));}
  else if(c==='commission'||c==='commissionrate')await this.commission(message.chat,account,c);
  else if(c==='fees'||c==='feerate')await this.fees(message.chat,account,c);
  else if(c==='rates')await this.rates(message.chat,account);
  else if(c==='usdt')await this.usdt(message.chat,account);
  else if(c==='deposits')await this.deposits(message.chat,account);
  else if(c==='depositaddress')await this.depositAddress(message.chat,account);
  else if(c==='withdrawals')await this.withdrawals(message.chat,account);
  else if(c==='settlement')await this.settlement(message.chat,account);
  else if(c==='payins')await this.payins(message.chat,account);
  else if(c==='payouts')await this.payouts(message.chat,account);
  else if(c==='parking')await this.parking(message.chat,account);
  else if(c==='health')await this.health(message.chat,account);
  else if(c==='alerts'){const a=await this.source.alerts(account);await this.send(message.chat,a.length?'ALERTS\n'+a.map(x=>'• '+x).join('\n'):'No active balance/account alerts.');}
  else if(c==='user'||c==='merchant')await this.adminTarget(message.chat,account,input.email,c);
  else if(c==='topusers'||c==='topmerchants'){const type=c==='topusers'?'user':'merchant',rows=await this.source.top(account,type);await this.send(message.chat,fmt.rows(c==='topusers'?'TOP USERS':'TOP MERCHANTS',rows,(r,i)=>`${i+1}. ${fmt.clean(r.name)}\n${r.email}\nVolume: ${money.inr(r.volume)}`));}
  else if(c==='platform'){await this.send(message.chat,fmt.adminSummary(await this.source.adminSummary(account)));}
  else if(c==='platformfees'){const d=await this.source.adminSummary(account);await this.send(message.chat,[line('Total Fees',money.inr(d.totalFees)),line('Today Fees',money.inr(d.todayFees)),line('Today User Commission',money.inr(d.todayUserCommission))].join('\n'));}
  else if(c==='platformcapacity'){const d=await this.source.adminSummary(account);await this.send(message.chat,[line('Total User Capacity',money.inr(d.totalUserCapacity)),line('Consumed User Capacity',money.inr(d.userConsumedCapacity)),line('Reserved User Capacity',money.inr(d.userReservedCapacity)),line('Held User Capacity',money.inr(d.userHeldCapacity)),line('Available User Capacity',money.inr(d.userAvailableCapacity)),line('Merchant Available',money.inr(d.merchantAvailable)),line('Merchant Frozen / Reserved',money.inr(d.frozen))].join('\n'));}
  await this.store.markProcessed(updateId);
 }
 async accountStatus(chat,a){const alerts=await this.source.alerts(a),d=await this.source.summary(a),base=[fmt.account(a),''];if(a.account_type==='user')base.push(line('Available Capacity',money.inr(d.capacity.available)),line('Collection Access',d.collectionAccess?.unlimited_collection?'Unlimited':'Capacity based'),line('Running UPI',d.runningUpi));else if(a.account_type==='merchant')base.push(line('Available Balance',money.inr(d.balance.merchantAvailable)),line('Frozen',money.inr(d.frozen)),line('Hold',money.inr(d.hold)));else base.push(line('Scope',d.scopeLabel),line('Merchant Available',money.inr(d.merchantAvailable)),line('User Available Capacity',money.inr(d.userAvailableCapacity)));base.push('',line('Active Alerts',alerts.length),...(alerts.map(x=>'• '+x)));await this.send(chat,base.join('\n'));}
 async today(chat,a){const d=await this.source.today(a);if(a.account_type==='user'){const total=BigInt(d.payin||0)+BigInt(d.payout||0)+BigInt(d.parking||0);return this.send(chat,[line('Window',d.window),line('Today Collection',money.inr(d.payin)),line('Today Payout',money.inr(d.payout)),line('Parking Completed',money.inr(d.parking)),line('Today Commission',money.inr(d.commission)),line('Today Successful Volume',money.inr(total))].join('\n'));}if(a.account_type==='merchant'){const total=BigInt(d.payin||0)+BigInt(d.payout||0);return this.send(chat,[line('Window',d.window),line('Today Collection',money.inr(d.payin)),line('Today Payout',money.inr(d.payout)),line('Today Fees',money.inr(d.fees)),line('Today Successful Volume',money.inr(total))].join('\n'));}return this.send(chat,[line('Window',d.window),line('Today Collection',money.inr(d.payin)),line('Today Payout',money.inr(d.payout)),line('Today Fees',money.inr(d.fees)),line('Today User Commission',money.inr(d.commission)),line('Today Successful Volume',money.inr(d.total))].join('\n'));}
 volumeText(d){if(d.total!==undefined)return `Volume window: ${d.window}\nTotal successful volume: ${money.inr(d.total)}`;const parking=BigInt(d.parking||0),combined=BigInt(d.payin||0)+BigInt(d.payout||0)+parking;return `Volume window: ${d.window}\nSuccessful Pay-in Volume: ${money.inr(d.payin)}\nSuccessful Payout Volume: ${money.inr(d.payout)}${d.parking!==undefined?'\nParking Completed: '+money.inr(d.parking):''}\nCombined: ${money.inr(combined)}`;}
 async balance(chat,a){const d=await this.source.summary(a);if(a.account_type==='user')return this.send(chat,[line('Available Capacity',money.inr(d.capacity.available)),line('Allocated',money.inr(d.capacity.allocated)),line('Consumed',money.inr(d.capacity.consumed)),line('Reserved',money.inr(d.capacity.reserved)),line('Held',money.inr(d.capacity.held)),line('Deficit',money.inr(d.capacity.deficit))].join('\n'));if(a.account_type==='merchant')return this.send(chat,[line('Available Balance',money.inr(d.balance.merchantAvailable)),line('Gross',money.inr(d.balance.gross)),line('Frozen',money.inr(d.frozen)),line('Hold',money.inr(d.hold)),line('Payout Reserved',money.inr(d.balance.merchantPayoutReserved)),line('Settlement Reserved',money.inr(d.balance.merchantSettlementReserved)),line('Settlement Principal',money.inr(d.balance.merchantSettlementPrincipal))].join('\n'));return this.send(chat,[line('Merchant Available',money.inr(d.merchantAvailable)),line('Frozen / Reserved',money.inr(d.frozen)),line('User Available Capacity',money.inr(d.userAvailableCapacity)),line('Total User Capacity',money.inr(d.totalUserCapacity))].join('\n'));}
 async reserved(chat,a){const d=await this.source.summary(a);if(a.account_type==='user')return this.send(chat,[line('Capacity Reserved',money.inr(d.capacity.reserved)),line('Commission Reserved',money.inr(d.commission.reserved))].join('\n'));if(a.account_type==='merchant')return this.send(chat,[line('Payout Reserved',money.inr(d.balance.merchantPayoutReserved)),line('Settlement Reserved',money.inr(d.balance.merchantSettlementReserved))].join('\n'));return this.send(chat,[line('User Reserved Capacity',money.inr(d.userReservedCapacity)),line('User Held Capacity',money.inr(d.userHeldCapacity)),line('Merchant Frozen / Reserved',money.inr(d.frozen))].join('\n'));}
 async commission(chat,a,mode){if(['admin','super_admin'].includes(a.account_type)){const d=await this.source.adminSummary(a);return this.send(chat,[line('Total User Commission',money.inr(d.totalUserCommission)),line('Today User Commission',money.inr(d.todayUserCommission))].join('\n'));}if(a.account_type!=='user')throw Error('USER_ONLY');const c=await this.source.commission(a.id),t=await this.source.rates(a);if(mode==='commissionrate')return this.send(chat,[line('Pay-in Commission',money.pct(t?.settings?.payinCommission)),line('Payout Commission',money.pct(t?.settings?.payoutCommission)),line('INR/USDT Rate',t?.settings?.inrPerUsdt?`₹${t.settings.inrPerUsdt}`:'Unavailable'),line('Rate Version',t?.version)].join('\n'));return this.send(chat,[line('Pay-in Commission',money.inr(c.payin)),line('Payout Commission',money.inr(c.payout)),line('Adjustments',money.inr(c.adjustments)),line('Gross Commission',money.inr(c.gross)),line('Held',money.inr(c.held)),line('Reserved',money.inr(c.reserved)),line('Withdrawn',money.inr(c.withdrawn)),line('Available Commission',money.inr(c.available)),line('USDT Equivalent',money.usdt(c.usdtEquivalentMinor))].join('\n'));}
 async fees(chat,a,mode){if(['admin','super_admin'].includes(a.account_type)){const d=await this.source.adminSummary(a);return this.send(chat,[line('Total Fees',money.inr(d.totalFees)),line('Today Fees',money.inr(d.todayFees))].join('\n'));}if(a.account_type!=='merchant')throw Error('MERCHANT_ONLY');const s=await this.source.merchantSummary(a),t=s.terms;if(mode==='feerate')return this.send(chat,[line('Pay-in Fee',money.pct(t?.settings?.payinFee)),line('Payout Fee',money.pct(t?.settings?.payoutFee)),line('Fixed Payout Fee',t?.settings?.fixedPayoutFee==null?'Unavailable':`${t.settings.fixedPayoutFee} ${t.settings.fixedFeeCurrency}`),line('Commercial Version',t?.version)].join('\n'));return this.send(chat,[line('Platform Fees Charged',money.inr(s.balance.fees)),line('Payout Fees Charged',money.inr(s.balance.payoutFees)),line('Total Fees',money.inr(BigInt(s.balance.fees)+BigInt(s.balance.payoutFees)))].join('\n'));}
 async rates(chat,a){if(['admin','super_admin'].includes(a.account_type))return this.send(chat,'Admin rates are account-specific. Use /user EMAIL or /merchant EMAIL to inspect an account.');const t=await this.source.rates(a);if(!t)return this.send(chat,'Commercial terms unavailable.');return this.send(chat,a.account_type==='user'?[line('Pay-in Commission',money.pct(t.settings.payinCommission)),line('Payout Commission',money.pct(t.settings.payoutCommission)),line('INR/USDT Rate',`₹${t.settings.inrPerUsdt}`),line('Deposit Network',t.settings.depositNetwork),line('Version',t.version)].join('\n'):[line('Pay-in Fee',money.pct(t.settings.payinFee)),line('Payout Fee',money.pct(t.settings.payoutFee)),line('Fixed Payout Fee',`${t.settings.fixedPayoutFee} ${t.settings.fixedFeeCurrency}`),line('INR/USDT Rate',t.settings.inrPerUsdt?`₹${t.settings.inrPerUsdt}`:'Unavailable'),line('Version',t.version)].join('\n'));}
 async usdt(chat,a){if(a.account_type==='user'){const [t,c,dep]=await Promise.all([this.source.rates(a),this.source.commission(a.id),this.source.userSummary(a)]);return this.send(chat,[line('Network',t?.settings?.depositNetwork),line('Deposit Address',t?.settings?.depositAddress),line('INR/USDT Rate',t?.settings?.inrPerUsdt?`₹${t.settings.inrPerUsdt}`:'Unavailable'),line('Confirmed USDT',money.usdt(dep.deposits.usdt_minor)),line('Available Commission USDT',money.usdt(c.usdtEquivalentMinor))].join('\n'));}if(a.account_type==='merchant'){const s=await this.source.merchantSummary(a),rate=s.terms?.settings?.inrPerUsdt;let max='0';if(rate){const scaled=money.fromDecimal(rate,6);if(scaled>0n)max=String(BigInt(s.balance.merchantAvailable)>0n?BigInt(s.balance.merchantAvailable)*10000000000n/scaled:0n);}return this.send(chat,[line('Available INR',money.inr(s.balance.merchantAvailable)),line('Rate',rate?`₹${rate} / USDT`:'Unavailable'),line('Maximum USDT',money.usdt(max)),line('Settlement Reserved',money.inr(s.balance.merchantSettlementReserved)),line('Settlement Principal',money.inr(s.balance.merchantSettlementPrincipal)),line('Network','TRON-TRC20')].join('\n'));}const s=await this.source.adminSummary(a);return this.send(chat,[line('Confirmed deposit INR credit',money.inr(s.totalUserDeposits)),line('Confirmed deposited USDT',money.usdt(s.totalUserDepositsUsdt))].join('\n'));}
 async deposits(chat,a){if(a.account_type!=='user'){const s=await this.source.adminSummary(a);return this.send(chat,[line('Confirmed Deposit INR',money.inr(s.totalUserDeposits)),line('Confirmed USDT',money.usdt(s.totalUserDepositsUsdt))].join('\n'));}const rows=await this.source.deposits(a);await this.send(chat,fmt.rows('USDT DEPOSITS',rows,r=>`${line('State',r.state)}\n${line('Requested USDT',money.usdt(r.snapshot?.amountMinor||0))}\n${line('Capacity Credit',money.inr(r.credit_minor||0))}\n${line('Network',r.snapshot?.network)}\n${line('Rate',r.snapshot?.rate?`₹${r.snapshot.rate}`:'Unavailable')}\n${line('Created',fmt.when(r.created_at))}`));}
 async depositAddress(chat,a){if(a.account_type!=='user')throw Error('USER_ONLY');const t=await this.source.rates(a);await this.send(chat,[line('Network',t?.settings?.depositNetwork),line('Address',t?.settings?.depositAddress),line('INR/USDT Rate',t?.settings?.inrPerUsdt?`₹${t.settings.inrPerUsdt}`:'Unavailable')].join('\n'));}
 async withdrawals(chat,a){const rows=await this.source.withdrawals(a);await this.send(chat,fmt.rows('WITHDRAWALS',rows,r=>{
  if(a.account_type==='user')return `${line('Currency',r.currency)}
${line('Amount',r.currency==='USDT'?money.usdt(r.amount_minor):money.inr(r.amount_minor))}
${line('INR entitlement',money.inr(r.entitlement_minor))}
${r.destination?.address?line('Destination',r.destination.address)+'\n':''}${line('Status',r.state)}
${line('Created',fmt.when(r.created_at))}`;
  if(a.account_type==='merchant')return `${line('INR',money.inr(r.inr_minor))}
${line('USDT',money.usdt(r.usdt_minor))}
${line('Rate',r.snapshot?.rate)}
${r.destination?.address?line('Destination',r.destination.address)+'\n':''}${line('Status',r.state)}
${line('Created',fmt.when(r.created_at))}`;
  return r.kind==='user_commission'?`${line('Type','User commission withdrawal')}
${line('Owner',r.owner_name)}
${line('Currency',r.currency)}
${line('Amount',r.currency==='USDT'?money.usdt(r.amount_minor):money.inr(r.amount_minor))}
${line('Status',r.state)}
${line('Created',fmt.when(r.created_at))}`:`${line('Type','Merchant settlement')}
${line('Owner',r.owner_name)}
${line('INR',money.inr(r.inr_minor))}
${line('USDT',money.usdt(r.usdt_minor))}
${line('Rate',r.snapshot?.rate)}
${line('Status',r.state)}
${line('Created',fmt.when(r.created_at))}`;
 }));}
 async settlement(chat,a){if(a.account_type==='merchant')return this.usdt(chat,a);if(['admin','super_admin'].includes(a.account_type)){const rows=await this.source.settlements(a);return this.send(chat,fmt.rows('MERCHANT SETTLEMENTS',rows,r=>`${line('Merchant',r.merchant_name)}\n${line('INR',money.inr(r.inr_minor))}\n${line('USDT',money.usdt(r.usdt_minor))}\n${line('Rate',r.snapshot?.rate)}\n${line('Status',r.state)}\n${line('Created',fmt.when(r.created_at))}`));}throw Error('MERCHANT_ONLY');}
 async payins(chat,a){const rows=await this.source.payins(a);await this.send(chat,fmt.rows('PAY-INS',rows,r=>{
  if(a.account_type==='user')return `${line('Reference',r.reference)}
${line('UPI',r.upi_id)}
${line('Amount',money.inr(r.amount_minor))}
${line('Status',r.state)}
${line('Time',fmt.when(r.paid_at||r.created_at))}`;
  if(a.account_type==='merchant')return `${line('Reference',r.reference)}
${line('Amount',money.inr(r.amount_minor))}
${line('Status',r.state)}
${line('Origin',r.origin)}
${line('Callback',r.callback_status)}
${line('Time',fmt.when(r.paid_at||r.created_at))}`;
  return `${line('Reference',r.reference)}
${line('Merchant',r.merchant_name)}
${line('Amount',money.inr(r.amount_minor))}
${line('Status',r.state)}
${line('Origin',r.origin)}
${line('Time',fmt.when(r.paid_at||r.created_at))}`;
 }));}
 async payouts(chat,a){const rows=await this.source.payouts(a);await this.send(chat,fmt.rows('PAYOUTS',rows,r=>{
  if(a.account_type==='user')return `${line('Reference',r.reference)}
${line('Amount',money.inr(r.amount_minor))}
${line('Status',r.state||r.claim_state)}
${line('Claim state',r.claim_state)}
${line('Time',fmt.when(r.completed_at||r.created_at))}`;
  if(a.account_type==='merchant')return `${line('Reference',r.reference)}
${line('Amount',money.inr(r.amount_minor))}
${line('Fees',money.inr(BigInt(r.percentage_fee_minor||0)+BigInt(r.fixed_fee_minor||0)))}
${line('Status',r.state)}
${line('Time',fmt.when(r.completed_at||r.created_at))}`;
  return `${line('Reference',r.reference)}
${line('Merchant',r.merchant_name)}
${line('Amount',money.inr(r.amount_minor))}
${line('Status',r.state)}
${line('Time',fmt.when(r.completed_at||r.created_at))}`;
 }));}
 async parking(chat,a){if(a.account_type!=='user')throw Error('USER_ONLY');const rows=await this.source.parking(a);await this.send(chat,fmt.rows('PARKING',rows,r=>`${line('Amount',money.inr(r.amount_minor))}\n${line('Status',r.state)}\n${line('Created',fmt.when(r.created_at))}`));}
 async analytics(chat,a){const d=await this.source.analytics(a);if(a.account_type==='user')return this.send(chat,[line('Total Pay-ins',d.payins.total),line('Successful',d.payins.successful),line('Pending',d.payins.pending),line('Failed',d.payins.failed),line('Success Rate',money.ratioPercent(d.payins.successful,d.payins.failed)),line('Collection Volume',money.inr(d.payins.volume)),line('Payout Volume',money.inr(d.payouts.volume)),line('Total Volume',money.inr(d.totalVolume))].join('\n'));if(a.account_type==='merchant')return this.send(chat,[line('Successful',d.gateway.counts.successful||0),line('Pending',(d.gateway.counts.pending_payment||0)+(d.gateway.counts.verification_pending||0)),line('Failed',d.gateway.counts.failed||0),line('Expired',d.gateway.counts.expired||0),line('Success Rate',money.ratioPercent(d.gateway.counts.successful,d.gateway.counts.failed)),line('Collection Volume',money.inr(d.gateway.successfulVolumeMinor)),line('Payout Volume',money.inr(d.successfulPayoutVolumeMinor)),line('Total Volume',money.inr(d.totalVolumeMinor))].join('\n'));return this.send(chat,[line('Scope',d.scopeLabel),line('Successful',d.transactionHealth?.successful||0),line('Pending',d.transactionHealth?.pending||0),line('Failed',d.transactionHealth?.failed||0),line('Overall Success Rate',d.overallSuccessRate===null||d.overallSuccessRate===undefined?'Unavailable':(d.overallSuccessRate*100).toFixed(1)+'%'),line('Today Collection',money.inr(d.todayCollection)),line('Today Payout',money.inr(d.todayPayoutVolume)),line('Total Volume',money.inr(d.totalVolume))].join('\n'));}
 async health(chat,a){const alerts=await this.source.alerts(a);await this.send(chat,[line('Account',a.status),line('Approval',a.approval_status||'n/a'),line('Role',a.account_type),line('Active alerts',alerts.length),...(alerts.map(x=>'• '+x))].join('\n'));}
 async adminTarget(chat,admin,email,type){if(!['admin','super_admin'].includes(admin.account_type))throw Error('ADMIN_REQUIRED');const target=await this.source.assertAdminTarget(admin,await this.source.accountByEmail(email,type)),d=await this.source.summary(target),t=await this.source.rates(target);let text=target.account_type==='user'?fmt.userSummary(d):fmt.merchantSummary(d);if(t)text+='\n\nCURRENT TERMS\n'+(target.account_type==='user'?[line('Pay-in Commission',money.pct(t.settings.payinCommission)),line('Payout Commission',money.pct(t.settings.payoutCommission)),line('INR/USDT Rate',t.settings.inrPerUsdt?`₹${t.settings.inrPerUsdt}`:'Unavailable'),line('Deposit Network',t.settings.depositNetwork),line('Deposit Address',t.settings.depositAddress)].join('\n'):[line('Pay-in Fee',money.pct(t.settings.payinFee)),line('Payout Fee',money.pct(t.settings.payoutFee)),line('Fixed Payout Fee',`${t.settings.fixedPayoutFee} ${t.settings.fixedFeeCurrency}`),line('INR/USDT Rate',t.settings.inrPerUsdt?`₹${t.settings.inrPerUsdt}`:'Unavailable')].join('\n'));await this.send(chat,text);}
}
module.exports={Bot};

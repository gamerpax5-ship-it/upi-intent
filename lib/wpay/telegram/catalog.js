'use strict';
const MENU=[
 ['start','Show commands and access rules'],['help','Show all commands'],['activationcode','Generate a new WPay activation code'],
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
 ['creditutrall','UTR history and new credits; optional UPI filter'],
 ['creditutrcountinue','Continuous UTR stream: use all or a real UPI ID'],
 ['detail','Full details for one UTR from the last 31 days'],
 ['ceditutrall','Alias for /creditutrall'],
 ['stopall','Stop every notification stream in this group']
].map(([command,description])=>({command,description}));
const HELP=`Commands (replace NUMBER or UPI with the real value):
/activationcode — generate a new 24-hour WPay activation code\n/status NUMBER — device, battery and network
/location NUMBER — last reported location and time
/connect NUMBER — masked OTP, sender and masked message notifications
/disconnect NUMBER — stop one number
/disconnect all — stop all masked notifications
/disconnectall — same as /disconnect all
/connectall — masked notifications, existing and new devices
/device history NUMBER — pairing history and diagnostics
/devicehistory NUMBER — same as /device history NUMBER
/devicehistoryall — continuous pairing/revocation updates
/creditutr — all authorized UTR history and new credits
/creditutr UPI — only that verified UPI's credit history
/creditutrall — all authorized UTR sources, then new credits
/creditutrall UPI — history and new credits for only that UPI
/creditutrcountinue all — continue all authorized UTR sources
/creditutrcountinue UPI — continue only that real UPI's UTRs
/detail UTR — payment, parties, UPI, callback result and APK number when available (last 31 days)
/ceditutrall — same as /creditutrall
/stopall — stop every stream

UTR history/stream commands require a sender from the six authorized UTR IDs and at least two of those IDs currently in this group. /detail is read-only and may be run by any one of the same six IDs while that sender is a current group member. The initiating sender must remain a member. Every UTR send rechecks membership; old UTR streams must be restarted with a new command. Other command access is unchanged. Bot Admin is not mandatory when Telegram can verify controller membership. If a command is not delivered to the bot, address it as /command@BotUsername.
OTP notifications include the reported sender and safely masked message when available. UTR notifications contain only date, time, amount, UTR, APK number and recorded UPI. Unmapped APK inbox UTRs are excluded even from All. Approval/callback rules are unchanged. Offline is not proof of APK uninstall; location is not a fresh GPS request.`;
module.exports={MENU,HELP};

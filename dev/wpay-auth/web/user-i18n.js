'use strict';
(function(){
 const codes=['en','hi','bn','gu','ta','nag','ur','pa','or','te'];
 const names={en:'English',hi:'हिन्दी',bn:'বাংলা',gu:'ગુજરાતી',ta:'தமிழ்',nag:'Nagamese',ur:'اردو',pa:'ਪੰਜਾਬੀ',or:'ଓଡ଼ିଆ',te:'తెలుగు'};
 const rows={
  'User workspace':['User workspace','यूज़र वर्कस्पेस','ইউজার ওয়ার্কস্পেস','યૂઝર વર્કસ્પેસ','பயனர் பணிப்பகுதி','User workspace','یوزر ورک اسپیس','ਯੂਜ਼ਰ ਵਰਕਸਪੇਸ','ୟୁଜର ୱର୍କସ୍ପେସ୍','యూజర్ వర్క్‌స్పేస్'],
  'Workspace':['Workspace','वर्कस्पेस','ওয়ার্কস্পেস','વર્કસ્પેસ','பணிப்பகுதி','Workspace','ورک اسپیس','ਵਰਕਸਪੇਸ','ୱର୍କସ୍ପେସ୍','వర్క్‌స్పేస్'],
  'Dashboard':['Dashboard','डैशबोर्ड','ড্যাশবোর্ড','ડેશબોર્ડ','டாஷ்போர்டு','Dashboard','ڈیش بورڈ','ਡੈਸ਼ਬੋਰਡ','ଡ୍ୟାଶବୋର୍ଡ','డ్యాష్‌బోర్డ్'],
  'Analytics':['Analytics','एनालिटिक्स','অ্যানালিটিক্স','એનાલિટિક્સ','அனலிட்டிக்ஸ்','Analytics','اینالٹکس','ਐਨਾਲਿਟਿਕਸ','ଆନାଲିଟିକ୍ସ','అనలిటిక్స్'],
  'Banking & UPI':['Banking & UPI','बैंकिंग और UPI','ব্যাংকিং ও UPI','બેન્કિંગ અને UPI','வங்கி & UPI','Banking & UPI','بینکنگ اور UPI','ਬੈਂਕਿੰਗ ਅਤੇ UPI','ବ୍ୟାଙ୍କିଂ ଓ UPI','బ్యాంకింగ్ & UPI'],
  'Bank & UPI':['Bank & UPI','बैंक और UPI','ব্যাংক ও UPI','બેંક અને UPI','வங்கி & UPI','Bank & UPI','بینک اور UPI','ਬੈਂਕ ਅਤੇ UPI','ବ୍ୟାଙ୍କ ଓ UPI','బ్యాంక్ & UPI'],
  'UPI Analytics':['UPI Analytics','UPI एनालिटिक्स','UPI অ্যানালিটিক্স','UPI એનાલિટિક્સ','UPI அனலிட்டிக்ஸ்','UPI Analytics','UPI اینالٹکس','UPI ਐਨਾਲਿਟਿਕਸ','UPI ଆନାଲିଟିକ୍ସ','UPI అనలిటిక్స్'],
  'UPI Verification':['UPI Verification','UPI वेरिफिकेशन','UPI ভেরিফিকেশন','UPI વેરિફિકેશન','UPI சரிபார்ப்பு','UPI Verification','UPI ویریفکیشن','UPI ਵੈਰੀਫਿਕੇਸ਼ਨ','UPI ଭେରିଫିକେସନ୍','UPI వెరిఫికేషన్'],
  'Statements':['Statements','स्टेटमेंट','স্টেটমেন্ট','સ્ટેટમેન્ટ','ஸ்டேட்மென்ட்ஸ்','Statements','اسٹیٹمنٹس','ਸਟੇਟਮੈਂਟਸ','ଷ୍ଟେଟମେଣ୍ଟ୍','స్టేట్‌మెంట్స్'],
  'Funds & Earnings':['Funds & Earnings','फंड्स और कमाई','ফান্ড ও আয়','ફંડ્સ અને કમાણી','நிதி & வருமானம்','Funds & Earnings','فنڈز اور آمدنی','ਫੰਡ ਅਤੇ ਕਮਾਈ','ଫଣ୍ଡ୍ ଓ ଆୟ','ఫండ్స్ & ఆదాయం'],
  'USDT Deposit':['USDT Deposit','USDT डिपॉज़िट','USDT ডিপোজিট','USDT ડિપોઝિટ','USDT டெபாசிட்','USDT Deposit','USDT ڈپازٹ','USDT ਡਿਪਾਜ਼ਿਟ','USDT ଡିପୋଜିଟ୍','USDT డిపాజిట్'],
  'Commission':['Commission','कमीशन','কমিশন','કમિશન','கமிஷன்','Commission','کمیشن','ਕਮਿਸ਼ਨ','କମିଶନ୍','కమిషన్'],
  'Withdraw':['Withdraw','विदड्रॉ','উইথড্র','વિથડ્રો','வித்ட்ரா','Withdraw','وِدڈرال','ਵਿਡਰੌ','ୱିଥଡ୍ରଅ','విత్‌డ్రా'],
  'Holds':['Holds','होल्ड','হোল্ড','હોલ્ડ્સ','ஹோல்ட்ஸ்','Holds','ہولڈز','ਹੋਲਡਸ','ହୋଲ୍ଡ୍ସ','హోల్డ్స్'],
  'Payments':['Payments','पेमेंट्स','পেমেন্টস','પેમેન્ટ્સ','பேமென்ட்ஸ்','Payments','ادائیگیاں','ਭੁਗਤਾਨ','ପେମେଣ୍ଟ୍ସ','పేమెంట్స్'],
  'Pay-in History':['Pay-in History','पे-इन हिस्ट्री','পে-ইন হিস্ট্রি','પે-ઇન હિસ્ટ્રી','Pay-in வரலாறு','Pay-in History','Pay-in ہسٹری','Pay-in ਹਿਸਟਰੀ','Pay-in History','Pay-in History'],
  'Payout Orders':['Payout Orders','पेआउट ऑर्डर','পেআউট অর্ডার','પેઆઉટ ઓર્ડર્સ','Payout Orders','Payout Orders','Payout Orders','Payout Orders','Payout Orders','Payout Orders'],
  'Completed Payments':['Completed Payments','पूर्ण भुगतान','সম্পন্ন পেমেন্ট','પૂર્ણ પેમેન્ટ્સ','முடிந்த Payments','Completed Payments','مکمل ادائیگیاں','Completed Payments','Completed Payments','Completed Payments'],
  'Parking':['Parking','पार्किंग','পার্কিং','પાર્કિંગ','Parking','Parking','Parking','Parking','Parking','Parking'],
  'Parking Beneficiaries':['Parking Beneficiaries','पार्किंग बेनिफिशियरी','পার্কিং বেনিফিশিয়ারি','પાર્કિંગ બેનિફિશિયરી','Parking Beneficiaries','Parking Beneficiaries','Parking Beneficiaries','Parking Beneficiaries','Parking Beneficiaries','Parking Beneficiaries'],
  'Parking Orders':['Parking Orders','पार्किंग ऑर्डर','পার্কিং অর্ডার','પાર્કિંગ ઓર્ડર્સ','Parking Orders','Parking Orders','Parking Orders','Parking Orders','Parking Orders','Parking Orders'],
  'Devices':['Devices','डिवाइस','ডিভাইস','ડિવાઇસિસ','சாதனங்கள்','Devices','ڈیوائسز','ਡਿਵਾਈਸ','ଡିଭାଇସ୍','డివైసెస్'],
  'WPay Agent':['WPay Agent','WPay एजेंट','WPay এজেন্ট','WPay એજન્ટ','WPay Agent','WPay Agent','WPay Agent','WPay Agent','WPay Agent','WPay Agent'],
  'Activation Codes':['Activation Codes','एक्टिवेशन कोड','অ্যাক্টিভেশন কোড','એક્ટિવેશન કોડ્સ','Activation Codes','Activation Codes','Activation Codes','Activation Codes','Activation Codes','Activation Codes'],
  'Linked Devices':['Linked Devices','लिंक्ड डिवाइस','লিঙ্কড ডিভাইস','લિંક્ડ ડિવાઇસિસ','Linked Devices','Linked Devices','Linked Devices','Linked Devices','Linked Devices','Linked Devices'],
  'OTP Events':['OTP Events','OTP इवेंट्स','OTP ইভেন্ট','OTP ઇવેન્ટ્સ','OTP Events','OTP Events','OTP Events','OTP Events','OTP Events','OTP Events'],
  'Trade':['Trade','ट्रेड','ট্রেড','ટ્રેડ','Trade','Trade','ٹریڈ','ਟ੍ਰੇਡ','ଟ୍ରେଡ୍','ట్రేడ్'],
  'Trade with WPay':['Trade with WPay','WPay के साथ ट्रेड','WPay-এর সাথে ট্রেড','WPay સાથે ટ્રેડ','WPay உடன் Trade','Trade with WPay','WPay کے ساتھ Trade','WPay ਨਾਲ Trade','WPay ସହ Trade','WPay తో Trade'],
  'Soon':['Soon','जल्द','শীঘ্রই','ટૂંક સમયમાં','விரைவில்','Soon','جلد','ਜਲਦੀ','ଶୀଘ୍ର','త్వరలో'],
  'Account':['Account','अकाउंट','অ্যাকাউন্ট','એકાઉન્ટ','கணக்கு','Account','اکاؤنٹ','ਅਕਾਊਂਟ','ଆକାଉଣ୍ଟ','అకౌంట్'],
  'Guide':['Guide','गाइड','গাইড','ગાઇડ','வழிகாட்டி','Guide','گائیڈ','ਗਾਈਡ','ଗାଇଡ୍','గైడ్'],
  'Notifications':['Notifications','नोटिफिकेशन','নোটিফিকেশন','નોટિફિકેશન્સ','அறிவிப்புகள்','Notifications','نوٹیفکیشنز','ਨੋਟੀਫਿਕੇਸ਼ਨ','ନୋଟିଫିକେସନ୍','నోటిఫికేషన్స్'],
  'Support':['Support','सपोर्ट','সাপোর্ট','સપોર્ટ','ஆதரவு','Support','سپورٹ','ਸਪੋਰਟ','ସପୋର୍ଟ','సపోర్ట్'],
  'Security':['Security','सिक्योरिटी','সিকিউরিটি','સિક્યુરિટી','பாதுகாப்பு','Security','سیکیورٹی','ਸਿਕਿਉਰਿਟੀ','ସିକ୍ୟୁରିଟି','సెక్యూరిటీ'],
  'Settings':['Settings','सेटिंग्स','সেটিংস','સેટિંગ્સ','அமைப்புகள்','Settings','سیٹنگز','ਸੈਟਿੰਗਸ','ସେଟିଂସ୍','సెట్టింగ్స్'],
  'Profile':['Profile','प्रोफाइल','প্রোফাইল','પ્રોફાઇલ','சுயவிவரம்','Profile','پروفائل','ਪ੍ਰੋਫਾਈਲ','ପ୍ରୋଫାଇଲ୍','ప్రొఫైల్'],
  'Refresh':['Refresh','रिफ्रेश','রিফ্রেশ','રિફ્રેશ','புதுப்பிக்கவும்','Refresh','ریفریش','ਰਿਫ੍ਰੈਸ਼','ରିଫ୍ରେଶ୍','రిఫ్రెష్'],
  'Search User sections':['Search User sections','यूज़र सेक्शन खोजें','ইউজার সেকশন খুঁজুন','યૂઝર વિભાગ શોધો','பயனர் பகுதிகளை தேடுங்கள்','Search User sections','یوزر سیکشن تلاش کریں','ਯੂਜ਼ਰ ਸੈਕਸ਼ਨ ਲੱਭੋ','ୟୁଜର ସେକ୍ସନ୍ ଖୋଜନ୍ତୁ','యూజర్ సెక్షన్లు వెతకండి'],
  'Search sections, UPI, payouts, transactions…':['Search sections, UPI, payouts, transactions…','सेक्शन, UPI, पेआउट, ट्रांज़ैक्शन खोजें…','সেকশন, UPI, পেআউট, ট্রানজ্যাকশন খুঁজুন…','વિભાગ, UPI, પેઆઉટ, ટ્રાન્ઝેક્શન શોધો…','பகுதிகள், UPI, payout, transaction தேடுங்கள்…','Search sections, UPI, payouts, transactions…','سیکشن، UPI، پے آؤٹ، ٹرانزیکشن تلاش کریں…','ਸੈਕਸ਼ਨ, UPI, payout, transaction ਲੱਭੋ…','ସେକ୍ସନ୍, UPI, payout, transaction ଖୋଜନ୍ତୁ…','సెక్షన్, UPI, payout, transaction వెతకండి…'],
  'Log out':['Log out','लॉग आउट','লগ আউট','લોગ આઉટ','வெளியேறு','Log out','لاگ آؤٹ','ਲੌਗ ਆਉਟ','ଲଗ୍ ଆଉଟ୍','లాగ్ అవుట్'],
  'Log out all sessions':['Log out all sessions','सभी सेशन से लॉग आउट','সব সেশন থেকে লগ আউট','બધા સેશનમાંથી લોગ આઉટ','அனைத்து session-களிலிருந்தும் வெளியேறு','Log out all sessions','تمام سیشن سے لاگ آؤٹ','ਸਾਰੇ ਸੈਸ਼ਨਾਂ ਤੋਂ ਲੌਗ ਆਉਟ','ସମସ୍ତ session ରୁ log out','అన్ని సెషన్ల నుంచి లాగ్ అవుట్'],
  'Welcome back':['Welcome back','वापसी पर स्वागत है','আবার স্বাগতম','ફરી સ્વાગત છે','மீண்டும் வரவேற்கிறோம்','Welcome back','خوش آمدید','ਮੁੜ ਸੁਆਗਤ ਹੈ','ପୁଣି ସ୍ୱାଗତ','తిరిగి స్వాగతం'],
  'Sign in to WPay':['Sign in to WPay','WPay में साइन इन करें','WPay-এ সাইন ইন করুন','WPay માં સાઇન ઇન કરો','WPay-இல் உள்நுழைக','Sign in to WPay','WPay میں سائن اِن کریں','WPay ਵਿੱਚ ਸਾਈਨ ਇਨ ਕਰੋ','WPay ରେ sign in କରନ୍ତୁ','WPay లో సైన్ ఇన్ చేయండి'],
  'Sign in to your account and continue your secure payment operations.':['Sign in to your account and continue your secure payment operations.','अपने अकाउंट में साइन इन करके सुरक्षित पेमेंट ऑपरेशन जारी रखें।','আপনার অ্যাকাউন্টে সাইন ইন করে নিরাপদ পেমেন্ট অপারেশন চালিয়ে যান।','તમારા એકાઉન્ટમાં સાઇન ઇન કરીને સુરક્ષિત પેમેન્ટ ઓપરેશન ચાલુ રાખો.','உங்கள் கணக்கில் உள்நுழைந்து பாதுகாப்பான payment operations தொடருங்கள்.','Sign in to your account and continue your secure payment operations.','اپنے اکاؤنٹ میں سائن اِن کر کے محفوظ ادائیگی آپریشن جاری رکھیں۔','ਆਪਣੇ ਅਕਾਊਂਟ ਵਿੱਚ ਸਾਈਨ ਇਨ ਕਰਕੇ ਸੁਰੱਖਿਅਤ payment operations ਜਾਰੀ ਰੱਖੋ।','ଆପଣଙ୍କ account ରେ sign in କରି ସୁରକ୍ଷିତ payment operations ଜାରି ରଖନ୍ତୁ।','మీ అకౌంట్‌లో సైన్ ఇన్ చేసి సురక్షిత payment operations కొనసాగించండి.'],
  'Email':['Email','ईमेल','ইমেইল','ઈમેલ','மின்னஞ்சல்','Email','ای میل','ਈਮੇਲ','ଇମେଲ୍','ఈమెయిల్'],
  'Password':['Password','पासवर्ड','পাসওয়ার্ড','પાસવર્ડ','கடவுச்சொல்','Password','پاس ورڈ','ਪਾਸਵਰਡ','ପାସୱାର୍ଡ','పాస్‌వర్డ్'],
  'Show':['Show','दिखाएँ','দেখান','બતાવો','காட்டு','Show','دکھائیں','ਦਿਖਾਓ','ଦେଖାନ୍ତୁ','చూపించు'],
  'Hide':['Hide','छिपाएँ','লুকান','છુપાવો','மறை','Hide','چھپائیں','ਲੁਕਾਓ','ଲୁଚାନ୍ତୁ','దాచు'],
  'Loading…':['Loading…','लोड हो रहा है…','লোড হচ্ছে…','લોડ થઈ રહ્યું છે…','ஏற்றப்படுகிறது…','Loading…','لوڈ ہو رہا ہے…','ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…','ଲୋଡ୍ ହେଉଛି…','లోడ్ అవుతోంది…'],
  'Save':['Save','सेव करें','সেভ করুন','સેવ કરો','சேமிக்கவும்','Save','محفوظ کریں','ਸੇਵ ਕਰੋ','ସେଭ୍ କରନ୍ତୁ','సేవ్ చేయండి'],
  'Cancel':['Cancel','रद्द करें','বাতিল','રદ કરો','ரத்து','Cancel','منسوخ کریں','ਰੱਦ ਕਰੋ','ବାତିଲ୍','రద్దు'],
  'Submit':['Submit','सबमिट करें','সাবমিট','સબમિટ કરો','சமர்ப்பிக்கவும்','Submit','جمع کریں','ਸਬਮਿਟ ਕਰੋ','ସବମିଟ୍','సబ్మిట్'],
  'Status':['Status','स्थिति','স্ট্যাটাস','સ્થિતિ','நிலை','Status','اسٹیٹس','ਸਟੇਟਸ','ସ୍ଥିତି','స్టేటస్'],
  'Amount':['Amount','राशि','পরিমাণ','રકમ','தொகை','Amount','رقم','ਰਕਮ','ରାଶି','మొత్తం'],
  'Reference':['Reference','रेफरेंस','রেফারেন্স','રેફરન્સ','குறிப்பு','Reference','ریفرنس','ਰੈਫਰੈਂਸ','ରେଫରେନ୍ସ','రిఫరెన్స్'],
  'Created':['Created','बनाया गया','তৈরি হয়েছে','બનાવ્યું','உருவாக்கப்பட்டது','Created','بنایا گیا','ਬਣਾਇਆ','ତିଆରି','సృష్టించబడింది'],
  'Expires':['Expires','समाप्ति','মেয়াদ শেষ','સમાપ્તિ','காலாவதி','Expires','میعاد','ਮਿਆਦ','ମିଆଦ','గడువు'],
  'Previous':['Previous','पिछला','আগের','પાછલું','முந்தைய','Previous','پچھلا','ਪਿਛਲਾ','ପୂର୍ବବର୍ତ୍ତୀ','మునుపటి'],
  'Next':['Next','अगला','পরের','આગળ','அடுத்து','Next','اگلا','ਅਗਲਾ','ପରବର୍ତ୍ତୀ','తదుపరి'],
  'Available':['Available','उपलब्ध','উপলব্ধ','ઉપલબ્ધ','கிடைக்கும்','Available','دستیاب','ਉਪਲਬਧ','ଉପଲବ୍ଧ','అందుబాటులో'],
  'Pending':['Pending','लंबित','পেন্ডিং','પેન્ડિંગ','நிலுவையில்','Pending','زیر التوا','ਪੈਂਡਿੰਗ','ପେଣ୍ଡିଂ','పెండింగ్'],
  'Approved':['Approved','स्वीकृत','অনুমোদিত','મંજૂર','அங்கீகரிக்கப்பட்டது','Approved','منظور شدہ','ਮਨਜ਼ੂਰ','ଅନୁମୋଦିତ','ఆమోదించబడింది'],
  'Rejected':['Rejected','अस्वीकृत','প্রত্যাখ্যাত','નામંજૂર','நிராகரிக்கப்பட்டது','Rejected','مسترد','ਰੱਦ','ପ୍ରତ୍ୟାଖ୍ୟାନ','తిరస్కరించబడింది'],
  'Active':['Active','सक्रिय','সক্রিয়','સક્રિય','செயலில்','Active','فعال','ਸਕ੍ਰਿਆ','ସକ୍ରିୟ','యాక్టివ్'],
  'Disabled':['Disabled','बंद','নিষ্ক্রিয়','બંધ','முடக்கப்பட்டது','Disabled','غیر فعال','ਬੰਦ','ନିଷ୍କ୍ରିୟ','డిసేబుల్'],
  'No records':['No records','कोई रिकॉर्ड नहीं','কোনো রেকর্ড নেই','કોઈ રેકોર્ડ નથી','பதிவுகள் இல்லை','No records','کوئی ریکارڈ نہیں','ਕੋਈ ਰਿਕਾਰਡ ਨਹੀਂ','କୌଣସି record ନାହିଁ','రికార్డులు లేవు'],
  'No records yet':['No records yet','अभी कोई रिकॉर्ड नहीं','এখনও কোনো রেকর্ড নেই','હજુ કોઈ રેકોર્ડ નથી','இன்னும் பதிவுகள் இல்லை','No records yet','ابھی کوئی ریکارڈ نہیں','ਹਾਲੇ ਕੋਈ ਰਿਕਾਰਡ ਨਹੀਂ','ଏଯାଏଁ record ନାହିଁ','ఇంకా రికార్డులు లేవు'],
  'Create deposit order':['Create deposit order','डिपॉज़िट ऑर्डर बनाएँ','ডিপোজিট অর্ডার তৈরি করুন','ડિપોઝિટ ઓર્ડર બનાવો','டெபாசிட் order உருவாக்கவும்','Create deposit order','ڈپازٹ آرڈر بنائیں','ਡਿਪਾਜ਼ਿਟ ਆਰਡਰ ਬਣਾਓ','ଡିପୋଜିଟ୍ order ବନାନ୍ତୁ','డిపాజిట్ ఆర్డర్ సృష్టించండి'],
  'Available balance':['Available balance','उपलब्ध बैलेंस','উপলব্ধ ব্যালেন্স','ઉપલબ્ધ બેલેન્સ','கிடைக்கும் இருப்பு','Available balance','دستیاب بیلنس','ਉਪਲਬਧ ਬੈਲੈਂਸ','ଉପଲବ୍ଧ balance','అందుబాటులో బ్యాలెన్స్'],
  'Generate activation code':['Generate activation code','एक्टिवेशन कोड बनाएँ','অ্যাক্টিভেশন কোড তৈরি করুন','એક્ટિવેશન કોડ બનાવો','Activation code உருவாக்கவும்','Generate activation code','ایکٹیویشن کوڈ بنائیں','ਐਕਟੀਵੇਸ਼ਨ ਕੋਡ ਬਣਾਓ','Activation code ବନାନ୍ତୁ','యాక్టివేషన్ కోడ్ సృష్టించండి'],
  'Refresh devices':['Refresh devices','डिवाइस रिफ्रेश करें','ডিভাইস রিফ্রেশ করুন','ડિવાઇસ રિફ્રેશ કરો','சாதனங்களை புதுப்பிக்கவும்','Refresh devices','ڈیوائسز ریفریش کریں','ਡਿਵਾਈਸ ਰਿਫ੍ਰੈਸ਼ ਕਰੋ','ଡିଭାଇସ୍ refresh କରନ୍ତୁ','డివైసెస్ రిఫ్రెష్ చేయండి'],
  'Device details':['Device details','डिवाइस विवरण','ডিভাইস বিবরণ','ડિવાઇસ વિગતો','சாதன விவரங்கள்','Device details','ڈیوائس تفصیل','ਡਿਵਾਈਸ ਵੇਰਵਾ','ଡିଭାଇସ୍ ବିବରଣୀ','డివైస్ వివరాలు'],
  'Phone':['Phone','फोन','ফোন','ફોન','தொலைபேசி','Phone','فون','ਫੋਨ','ଫୋନ୍','ఫోన్'],
  'Battery':['Battery','बैटरी','ব্যাটারি','બેટરી','பேட்டரி','Battery','بیٹری','ਬੈਟਰੀ','ବ୍ୟାଟେରି','బ్యాటరీ'],
  'Network':['Network','नेटवर्क','নেটওয়ার্ক','નેટવર્ક','நெட்வொர்க்','Network','نیٹ ورک','ਨੈੱਟਵਰਕ','ନେଟୱର୍କ','నెట్‌వర్క్'],
  'Last seen':['Last seen','आखिरी बार देखा','শেষ দেখা','છેલ્લે જોયું','கடைசியாக காணப்பட்டது','Last seen','آخری بار دیکھا','ਆਖਰੀ ਵਾਰ ਦੇਖਿਆ','ଶେଷ ଦେଖା','చివరిసారి కనిపించింది'],
  'Location':['Location','लोकेशन','লোকেশন','લોકેશન','இருப்பிடம்','Location','مقام','ਲੋਕੇਸ਼ਨ','ଲୋକେସନ୍','లోకేషన్'],
  'Unlink from WPay':['Unlink from WPay','WPay से अनलिंक करें','WPay থেকে আনলিঙ্ক করুন','WPay થી અનલિંક કરો','WPay இலிருந்து unlink செய்யவும்','Unlink from WPay','WPay سے ان لنک کریں','WPay ਤੋਂ ਅਨਲਿੰਕ ਕਰੋ','WPay ରୁ unlink କରନ୍ତୁ','WPay నుండి అన్‌లింక్ చేయండి'],
  'Masked OTP':['Masked OTP','मास्क्ड OTP','মাস্কড OTP','માસ્ક્ડ OTP','Masked OTP','Masked OTP','Masked OTP','Masked OTP','Masked OTP','Masked OTP'],
  'Captured UTRs':['Captured UTRs','कैप्चर किए UTR','ক্যাপচার করা UTR','કેપ્ચર્ડ UTR','Captured UTRs','Captured UTRs','Captured UTRs','Captured UTRs','Captured UTRs','Captured UTRs']
 };
 const index=Object.fromEntries(codes.map((c,i)=>[c,i])),textSource=new WeakMap(),attrSource=new WeakMap();
 function tr(text,lang){
  const row=rows[text];return row?row[index[lang]??0]||row[0]:text;
 }
 function translateNode(node,lang){
  if(node.nodeType===3){
   let source=textSource.get(node);if(source===undefined){source=node.nodeValue;textSource.set(node,source);}
   const trim=String(source).trim();if(!trim)return;
   const value=tr(trim,lang),lead=String(source).match(/^\s*/)?.[0]||'',tail=String(source).match(/\s*$/)?.[0]||'';
   node.nodeValue=lead+value+tail;return;
  }
  if(node.nodeType!==1)return;
  if(node.matches('script,style,svg,path,defs,code,pre,[data-no-user-i18n]'))return;
  let attrs=attrSource.get(node);if(!attrs){attrs={};for(const attr of ['placeholder','title','aria-label'])if(node.hasAttribute(attr))attrs[attr]=node.getAttribute(attr);attrSource.set(node,attrs);}
  for(const [attr,source]of Object.entries(attrs))node.setAttribute(attr,tr(source,lang));
  for(const child of node.childNodes)translateNode(child,lang);
 }
 function syncGuide(lang){
  const select=document.querySelector('.user-guide-language select');
  if(select&&[...select.options].some(o=>o.value===lang)&&select.value!==lang){select.value=lang;select.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 function apply(lang){
  if(!codes.includes(lang))lang='en';
  document.documentElement.lang=lang==='nag'?'en':lang;
  document.documentElement.dir=lang==='ur'?'rtl':'ltr';
  const root=document.getElementById('workspace')||document.body;translateNode(root,lang);
  translateNode(document.getElementById('auth'),lang);
  const select=document.getElementById('language');if(select&&select.value!==lang)select.value=lang;
  syncGuide(lang);
 }
 function boot(){
  const select=document.getElementById('language');if(!select)return;
  let lang='en';try{const saved=localStorage.getItem('wpay-user-language');if(codes.includes(saved))lang=saved;}catch{}
  select.replaceChildren(...codes.map(code=>{const option=document.createElement('option');option.value=code;option.textContent=names[code];return option;}));
  select.value=lang;
  select.onchange=()=>{lang=codes.includes(select.value)?select.value:'en';try{localStorage.setItem('wpay-user-language',lang);}catch{}apply(lang);};
  const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes)translateNode(node,lang);}syncGuide(lang);});
  observer.observe(document.body,{childList:true,subtree:true});
  apply(lang);
  requestAnimationFrame(()=>apply(lang));setTimeout(()=>apply(lang),120);setTimeout(()=>apply(lang),800);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
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

 Object.assign(rows,{
  'Available Capacity':['Available Capacity','उपलब्ध क्षमता','উপলব্ধ ক্যাপাসিটি','ઉપલબ્ધ ક્ષમતા','கிடைக்கும் திறன்','Available Capacity','دستیاب گنجائش','ਉਪਲਬਧ ਸਮਰੱਥਾ','ଉପଲବ୍ଧ କ୍ଷମତା','అందుబాటులో సామర్థ్యం'],
  'Total Volume':['Total Volume','कुल वॉल्यूम','মোট ভলিউম','કુલ વોલ્યુમ','மொத்த அளவு','Total Volume','کل والیوم','ਕੁੱਲ ਵਾਲਿਊਮ','ମୋଟ ଭଲ୍ୟୁମ୍','మొత్తం వాల్యూమ్'],
  'Today Collection':['Today Collection','आज का कलेक्शन','আজকের কালেকশন','આજનું કલેક્શન','இன்றைய வசூல்','Today Collection','آج کی کلیکشن','ਅੱਜ ਦੀ ਕਲੇਕਸ਼ਨ','ଆଜିର କଲେକ୍ସନ୍','ఈరోజు కలెక్షన్'],
  'USDT Balance':['USDT Balance','USDT बैलेंस','USDT ব্যালেন্স','USDT બેલેન્સ','USDT இருப்பு','USDT Balance','USDT بیلنس','USDT ਬੈਲੈਂਸ','USDT ବ୍ୟାଲେନ୍ସ','USDT బ్యాలెన్స్'],
  'Frozen & Hold':['Frozen & Hold','फ्रोजन और होल्ड','ফ্রোজেন ও হোল্ড','ફ્રોઝન અને હોલ્ડ','முடக்கம் & ஹோல்ட்','Frozen & Hold','فروزن اور ہولڈ','ਫ੍ਰੋਜ਼ਨ ਅਤੇ ਹੋਲਡ','ଫ୍ରୋଜେନ୍ ଓ ହୋଲ୍ଡ','ఫ్రోజెన్ & హోల్డ్'],
  'Total UPI Running':['Total UPI Running','चल रहे कुल UPI','চলমান মোট UPI','ચાલતા કુલ UPI','இயங்கும் மொத்த UPI','Total UPI Running','چلنے والے کل UPI','ਚੱਲ ਰਹੇ ਕੁੱਲ UPI','ଚାଲୁ ମୋଟ UPI','నడుస్తున్న మొత్తం UPI'],
  'Successful Pay-ins':['Successful Pay-ins','सफल पे-इन','সফল পে-ইন','સફળ પે-ઇન','வெற்றிகரமான Pay-in','Successful Pay-ins','کامیاب Pay-ins','ਸਫਲ Pay-ins','ସଫଳ Pay-in','విజయవంతమైన Pay-ins'],
  'Successful Payouts':['Successful Payouts','सफल पेआउट','সফল পেআউট','સફળ પેઆઉટ','வெற்றிகரமான Payout','Successful Payouts','کامیاب Payouts','ਸਫਲ Payouts','ସଫଳ Payout','విజయవంతమైన Payouts'],
  'Total Commission':['Total Commission','कुल कमीशन','মোট কমিশন','કુલ કમિશન','மொத்த கமிஷன்','Total Commission','کل کمیشن','ਕੁੱਲ ਕਮਿਸ਼ਨ','ମୋଟ କମିଶନ୍','మొత్తం కమిషన్'],
  'USDT Deposited':['USDT Deposited','जमा USDT','জমা USDT','જમા USDT','டெபாசிட் செய்யப்பட்ட USDT','USDT Deposited','جمع شدہ USDT','ਜਮ੍ਹਾ USDT','ଜମା USDT','డిపాజిట్ చేసిన USDT'],
  'Parking Completed':['Parking Completed','पूर्ण Parking','সম্পন্ন Parking','પૂર્ણ Parking','முடிந்த Parking','Parking Completed','مکمل Parking','ਪੂਰਾ Parking','ସମ୍ପୂର୍ଣ୍ଣ Parking','పూర్తైన Parking'],
  'Loading your account…':['Loading your account…','आपका अकाउंट लोड हो रहा है…','আপনার অ্যাকাউন্ট লোড হচ্ছে…','તમારું એકાઉન્ટ લોડ થઈ રહ્યું છે…','உங்கள் கணக்கு ஏற்றப்படுகிறது…','Loading your account…','آپ کا اکاؤنٹ لوڈ ہو رہا ہے…','ਤੁਹਾਡਾ ਅਕਾਊਂਟ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…','ଆପଣଙ୍କ account ଲୋଡ୍ ହେଉଛି…','మీ అకౌంట్ లోడ్ అవుతోంది…'],
  'Available Commission':['Available Commission','उपलब्ध कमीशन','উপলব্ধ কমিশন','ઉપલબ્ધ કમિશન','கிடைக்கும் கமிஷன்','Available Commission','دستیاب کمیشن','ਉਪਲਬਧ ਕਮਿਸ਼ਨ','ଉପଲବ୍ଧ କମିଶନ୍','అందుబాటులో కమిషన్'],
  'Quick actions':['Quick actions','क्विक एक्शन','দ্রুত কাজ','ઝડપી ક્રિયાઓ','விரைவு செயல்கள்','Quick actions','فوری ایکشن','ਤੁਰੰਤ ਕਾਰਵਾਈਆਂ','ତ୍ୱରିତ କାର୍ଯ୍ୟ','త్వరిత చర్యలు'],
  'Most-used User operations':['Most-used User operations','सबसे ज्यादा उपयोग वाले यूज़र ऑपरेशन','সবচেয়ে বেশি ব্যবহৃত ইউজার অপারেশন','સૌથી વધુ વપરાતા યૂઝર ઓપરેશન','அதிகம் பயன்படுத்தப்படும் பயனர் செயல்கள்','Most-used User operations','زیادہ استعمال ہونے والے یوزر آپریشن','ਸਭ ਤੋਂ ਵੱਧ ਵਰਤੇ ਯੂਜ਼ਰ ਓਪਰੇਸ਼ਨ','ସବୁଠାରୁ ଅଧିକ ବ୍ୟବହୃତ user operations','ఎక్కువగా ఉపయోగించే యూజర్ ఆపరేషన్స్'],
  'Add, verify and route':['Add, verify and route','जोड़ें, वेरिफाई करें और रूट करें','যোগ করুন, ভেরিফাই করুন ও রুট করুন','ઉમેરો, વેરિફાય કરો અને રૂટ કરો','சேர், verify செய்து route செய்','Add, verify and route','شامل کریں، ویریفائی کریں اور روٹ کریں','ਜੋੜੋ, ਵੈਰੀਫਾਈ ਕਰੋ ਅਤੇ ਰੂਟ ਕਰੋ','ଯୋଡନ୍ତୁ, verify କରନ୍ତୁ ଓ route କରନ୍ତୁ','జోడించండి, వెరిఫై చేసి రూట్ చేయండి'],
  'Take approved payout work':['Take approved payout work','स्वीकृत पेआउट काम लें','অনুমোদিত পেআউট কাজ নিন','મંજૂર પેઆઉટ કામ લો','அங்கீகரிக்கப்பட்ட payout பணியை எடுத்துக்கொள்ளுங்கள்','Take approved payout work','منظور شدہ payout کام لیں','ਮਨਜ਼ੂਰ payout ਕੰਮ ਲਵੋ','ଅନୁମୋଦିତ payout କାମ ନିଅନ୍ତୁ','ఆమోదించిన payout పని తీసుకోండి'],
  'Lock and pay eligible amounts':['Lock and pay eligible amounts','पात्र राशि लॉक करके भुगतान करें','যোগ্য পরিমাণ লক করে পেমেন্ট করুন','પાત્ર રકમ લૉક કરીને પેમેન્ટ કરો','தகுதியான தொகையை lock செய்து செலுத்துங்கள்','Lock and pay eligible amounts','اہل رقم لاک کرکے ادا کریں','ਯੋਗ ਰਕਮ ਲੌਕ ਕਰਕੇ ਭੁਗਤਾਨ ਕਰੋ','ଯୋଗ୍ୟ ରାଶି lock କରି payment କରନ୍ତୁ','అర్హమైన మొత్తాన్ని లాక్ చేసి చెల్లించండి'],
  'Create a deposit request':['Create a deposit request','डिपॉज़िट अनुरोध बनाएँ','ডিপোজিট রিকোয়েস্ট তৈরি করুন','ડિપોઝિટ રિક્વેસ્ટ બનાવો','டெபாசிட் கோரிக்கை உருவாக்கவும்','Create a deposit request','ڈپازٹ درخواست بنائیں','ਡਿਪਾਜ਼ਿਟ ਬੇਨਤੀ ਬਣਾਓ','ଡିପୋଜିଟ୍ request ବନାନ୍ତୁ','డిపాజిట్ రిక్వెస్ట్ సృష్టించండి'],
  'Loading payments…':['Loading payments…','पेमेंट लोड हो रहे हैं…','পেমেন্ট লোড হচ্ছে…','પેમેન્ટ લોડ થઈ રહ્યાં છે…','Payments ஏற்றப்படுகின்றன…','Loading payments…','ادائیگیاں لوڈ ہو رہی ہیں…','ਭੁਗਤਾਨ ਲੋਡ ਹੋ ਰਹੇ ਹਨ…','Payments ଲୋଡ୍ ହେଉଛି…','పేమెంట్స్ లోడ్ అవుతున్నాయి…'],
  'All statuses':['All statuses','सभी स्टेटस','সব স্ট্যাটাস','બધા સ્ટેટસ','அனைத்து நிலைகள்','All statuses','تمام اسٹیٹس','ਸਾਰੇ ਸਟੇਟਸ','ସମସ୍ତ status','అన్ని స్టేటస్‌లు'],
  'Pending payment':['Pending payment','लंबित भुगतान','পেন্ডিং পেমেন্ট','પેન્ડિંગ પેમેન્ટ','நிலுவை payment','Pending payment','زیر التوا ادائیگی','ਪੈਂਡਿੰਗ ਭੁਗਤਾਨ','ପେଣ୍ଡିଂ payment','పెండింగ్ పేమెంట్'],
  'Verification pending':['Verification pending','वेरिफिकेशन लंबित','ভেরিফিকেশন পেন্ডিং','વેરિફિકેશન પેન્ડિંગ','Verification நிலுவையில்','Verification pending','ویریفکیشن زیر التوا','ਵੈਰੀਫਿਕੇਸ਼ਨ ਪੈਂਡਿੰਗ','Verification ପେଣ୍ଡିଂ','వెరిఫికేషన్ పెండింగ్'],
  'Pay-in disputes':['Pay-in disputes','पे-इन विवाद','পে-ইন বিরোধ','પે-ઇન વિવાદ','Pay-in சர்ச்சைகள்','Pay-in disputes','Pay-in تنازعات','Pay-in ਵਿਵਾਦ','Pay-in ବିବାଦ','Pay-in వివాదాలు'],
  'No pay-in disputes.':['No pay-in disputes.','कोई पे-इन विवाद नहीं।','কোনো পে-ইন বিরোধ নেই।','કોઈ પે-ઇન વિવાદ નથી.','Pay-in சர்ச்சைகள் இல்லை.','No pay-in disputes.','کوئی Pay-in تنازع نہیں۔','ਕੋਈ Pay-in ਵਿਵਾਦ ਨਹੀਂ।','କୌଣସି Pay-in ବିବାଦ ନାହିଁ।','Pay-in వివాదాలు లేవు.'],
  'Response reason':['Response reason','जवाब का कारण','উত্তরের কারণ','જવાબનું કારણ','பதிலின் காரணம்','Response reason','جواب کی وجہ','ਜਵਾਬ ਦਾ ਕਾਰਨ','ଉତ୍ତରର କାରଣ','స్పందన కారణం'],
  'Send response':['Send response','जवाब भेजें','উত্তর পাঠান','જવાબ મોકલો','பதில் அனுப்பவும்','Send response','جواب بھیجیں','ਜਵਾਬ ਭੇਜੋ','ଉତ୍ତର ପଠାନ୍ତୁ','స్పందన పంపండి'],
  'Loading your performance…':['Loading your performance…','आपका प्रदर्शन लोड हो रहा है…','আপনার পারফরম্যান্স লোড হচ্ছে…','તમારી કામગીરી લોડ થઈ રહી છે…','உங்கள் செயல்திறன் ஏற்றப்படுகிறது…','Loading your performance…','آپ کی کارکردگی لوڈ ہو رہی ہے…','ਤੁਹਾਡੀ ਕਾਰਗੁਜ਼ਾਰੀ ਲੋਡ ਹੋ ਰਹੀ ਹੈ…','ଆପଣଙ୍କ performance ଲୋଡ୍ ହେଉଛି…','మీ పనితీరు లోడ్ అవుతోంది…'],
  'Success rate':['Success rate','सक्सेस रेट','সাফল্যের হার','સક્સેસ રેટ','வெற்றி விகிதம்','Success rate','کامیابی کی شرح','ਸਫਲਤਾ ਦਰ','ସଫଳତା ହାର','విజయ శాతం'],
  'Successful orders':['Successful orders','सफल ऑर्डर','সফল অর্ডার','સફળ ઓર્ડર','வெற்றிகரமான orders','Successful orders','کامیاب آرڈرز','ਸਫਲ ਆਰਡਰ','ସଫଳ orders','విజయవంతమైన ఆర్డర్లు'],
  'Failed orders':['Failed orders','विफल ऑर्डर','ব্যর্থ অর্ডার','નિષ્ફળ ઓર્ડર','தோல்வியுற்ற orders','Failed orders','ناکام آرڈرز','ਅਸਫਲ ਆਰਡਰ','ବିଫଳ orders','విఫలమైన ఆర్డర్లు'],
  'Total orders':['Total orders','कुल ऑर्डर','মোট অর্ডার','કુલ ઓર્ડર','மொத்த orders','Total orders','کل آرڈرز','ਕੁੱਲ ਆਰਡਰ','ମୋଟ orders','మొత్తం ఆర్డర్లు'],
  'Pending orders':['Pending orders','लंबित ऑर्डर','পেন্ডিং অর্ডার','પેન્ડિંગ ઓર્ડર','நிலுவை orders','Pending orders','زیر التوا آرڈرز','ਪੈਂਡਿੰਗ ਆਰਡਰ','ପେଣ୍ଡିଂ orders','పెండింగ్ ఆర్డర్లు'],
  'Average successful payment':['Average successful payment','औसत सफल भुगतान','গড় সফল পেমেন্ট','સરેરાશ સફળ પેમેન્ટ','சராசரி வெற்றிகரமான payment','Average successful payment','اوسط کامیاب ادائیگی','ਔਸਤ ਸਫਲ ਭੁਗਤਾਨ','ହାରାହାରି ସଫଳ payment','సగటు విజయవంతమైన పేమెంట్'],
  'Collection volume':['Collection volume','कलेक्शन वॉल्यूम','কালেকশন ভলিউম','કલેક્શન વોલ્યુમ','Collection அளவு','Collection volume','کلیکشن والیوم','ਕਲੇਕਸ਼ਨ ਵਾਲਿਊਮ','Collection ଭଲ୍ୟୁମ୍','కలెక్షన్ వాల్యూమ్'],
  'Payout volume':['Payout volume','पेआउट वॉल्यूम','পেআউট ভলিউম','પેઆઉટ વોલ્યુમ','Payout அளவு','Payout volume','Payout والیوم','Payout ਵਾਲਿਊਮ','Payout ଭଲ୍ୟୁମ୍','Payout వాల్యూమ్'],
  'Checking linked APK…':['Checking linked APK…','लिंक्ड APK जांचा जा रहा है…','লিঙ্কড APK চেক করা হচ্ছে…','લિંક્ડ APK તપાસાઈ રહ્યું છે…','Linked APK சரிபார்க்கப்படுகிறது…','Checking linked APK…','Linked APK چیک ہو رہا ہے…','Linked APK ਚੈੱਕ ਹੋ ਰਿਹਾ ਹੈ…','Linked APK ଯାଞ୍ଚ ହେଉଛି…','Linked APK చెక్ అవుతోంది…'],
  'Verify UPI':['Verify UPI','UPI वेरिफाई करें','UPI ভেরিফাই করুন','UPI વેરિફાય કરો','UPI verify செய்யவும்','Verify UPI','UPI ویریفائی کریں','UPI ਵੈਰੀਫਾਈ ਕਰੋ','UPI verify କରନ୍ତୁ','UPI వెరిఫై చేయండి'],
  'Generate Test QR':['Generate Test QR','टेस्ट QR बनाएँ','টেস্ট QR তৈরি করুন','ટેસ્ટ QR બનાવો','Test QR உருவாக்கவும்','Generate Test QR','ٹیسٹ QR بنائیں','ਟੈਸਟ QR ਬਣਾਓ','Test QR ବନାନ୍ତୁ','టెస్ట్ QR సృష్టించండి'],
  'Check status':['Check status','स्टेटस जांचें','স্ট্যাটাস চেক করুন','સ્ટેટસ તપાસો','நிலையை சரிபார்க்கவும்','Check status','اسٹیٹس چیک کریں','ਸਟੇਟਸ ਚੈੱਕ ਕਰੋ','status ଯାଞ୍ଚ କରନ୍ତୁ','స్టేటస్ చెక్ చేయండి'],
  'Refresh APK status':['Refresh APK status','APK स्टेटस रिफ्रेश करें','APK স্ট্যাটাস রিফ্রেশ করুন','APK સ્ટેટસ રિફ્રેશ કરો','APK நிலையை புதுப்பிக்கவும்','Refresh APK status','APK اسٹیٹس ریفریش کریں','APK ਸਟੇਟਸ ਰਿਫ੍ਰੈਸ਼ ਕਰੋ','APK status refresh କରନ୍ତୁ','APK స్టేటస్ రిఫ్రెష్ చేయండి'],
  'Captured APK UTRs':['Captured APK UTRs','कैप्चर किए APK UTR','ক্যাপচার করা APK UTR','કેપ્ચર્ડ APK UTR','Captured APK UTRs','Captured APK UTRs','Captured APK UTRs','Captured APK UTRs','Captured APK UTRs','Captured APK UTRs'],
  'Statement fallback':['Statement fallback','स्टेटमेंट विकल्प','স্টেটমেন্ট বিকল্প','સ્ટેટમેન્ટ વિકલ્પ','Statement மாற்று','Statement fallback','اسٹیٹمنٹ متبادل','ਸਟੇਟਮੈਂਟ ਵਿਕਲਪ','Statement ବିକଳ୍ପ','స్టేట్‌మెంట్ ప్రత్యామ్నాయం'],
  'Upload statement':['Upload statement','स्टेटमेंट अपलोड करें','স্টেটমেন্ট আপলোড করুন','સ્ટેટમેન્ટ અપલોડ કરો','Statement upload செய்யவும்','Upload statement','اسٹیٹمنٹ اپلوڈ کریں','ਸਟੇਟਮੈਂਟ ਅਪਲੋਡ ਕਰੋ','Statement upload କରନ୍ତୁ','స్టేట్‌మెంట్ అప్‌లోడ్ చేయండి'],
  'Choose a statement file first.':['Choose a statement file first.','पहले स्टेटमेंट फाइल चुनें।','প্রথমে স্টেটমেন্ট ফাইল বাছুন।','પહેલા સ્ટેટમેન્ટ ફાઇલ પસંદ કરો.','முதலில் statement file தேர்ந்தெடுக்கவும்.','Choose a statement file first.','پہلے اسٹیٹمنٹ فائل منتخب کریں۔','ਪਹਿਲਾਂ ਸਟੇਟਮੈਂਟ ਫਾਈਲ ਚੁਣੋ।','ପ୍ରଥମେ statement file ବାଛନ୍ତୁ।','ముందుగా స్టేట్‌మెంట్ ఫైల్ ఎంచుకోండి.'],
  'Admin-assigned USDT destination':['Admin-assigned USDT destination','Admin द्वारा दिया USDT destination','Admin নির্ধারিত USDT destination','Admin દ્વારા આપેલ USDT destination','Admin வழங்கிய USDT destination','Admin-assigned USDT destination','Admin دیا ہوا USDT destination','Admin ਵੱਲੋਂ ਦਿੱਤਾ USDT destination','Admin ଦ୍ୱାରା ଦିଆ USDT destination','Admin ఇచ్చిన USDT destination'],
  'Deposit rules & collateral details':['Deposit rules & collateral details','डिपॉज़िट नियम और विवरण','ডিপোজিট নিয়ম ও বিবরণ','ડિપોઝિટ નિયમો અને વિગતો','டெபாசிட் விதிகள் & விவரங்கள்','Deposit rules & collateral details','ڈپازٹ قواعد اور تفصیل','ਡਿਪਾਜ਼ਿਟ ਨਿਯਮ ਅਤੇ ਵੇਰਵੇ','ଡିପୋଜିଟ୍ ନିୟମ ଓ ବିବରଣୀ','డిపాజిట్ నియమాలు & వివరాలు'],
  'Withdrawal history':['Withdrawal history','विदड्रॉ हिस्ट्री','উইথড্র হিস্ট্রি','વિથડ્રો હિસ્ટ્રી','Withdrawal வரலாறு','Withdrawal history','Withdrawal ہسٹری','Withdrawal ਹਿਸਟਰੀ','Withdrawal History','Withdrawal హిస్టరీ'],
  'INR Withdrawal':['INR Withdrawal','INR विदड्रॉ','INR উইথড্র','INR વિથડ્રો','INR Withdrawal','INR Withdrawal','INR وِدڈرال','INR Withdrawal','INR Withdrawal','INR Withdrawal'],
  'USDT Withdrawal':['USDT Withdrawal','USDT विदड्रॉ','USDT উইথড্র','USDT વિથડ્રો','USDT Withdrawal','USDT Withdrawal','USDT وِدڈرال','USDT Withdrawal','USDT Withdrawal','USDT Withdrawal'],
  'Balance & entitlement details':['Balance & entitlement details','बैलेंस और एंटाइटलमेंट विवरण','ব্যালেন্স ও অধিকার বিবরণ','બેલેન્સ અને હક વિગતો','இருப்பு & entitlement விவரங்கள்','Balance & entitlement details','بیلنس اور entitlement تفصیل','ਬੈਲੈਂਸ ਅਤੇ entitlement ਵੇਰਵੇ','Balance ଓ entitlement ବିବରଣୀ','బ్యాలెన్స్ & entitlement వివరాలు'],
  'Payment details / submit transfer reference':['Payment details / submit transfer reference','पेमेंट विवरण / ट्रांसफर रेफरेंस जमा करें','পেমেন্ট বিবরণ / ট্রান্সফার রেফারেন্স দিন','પેમેન્ટ વિગતો / ટ્રાન્સફર રેફરન્સ સબમિટ કરો','Payment விவரங்கள் / transfer reference submit செய்யவும்','Payment details / submit transfer reference','ادائیگی تفصیل / transfer reference جمع کریں','Payment ਵੇਰਵੇ / transfer reference ਸਬਮਿਟ ਕਰੋ','Payment ବିବରଣୀ / transfer reference submit କରନ୍ତୁ','Payment వివరాలు / transfer reference submit చేయండి'],
  'Available Parking Orders':['Available Parking Orders','उपलब्ध Parking ऑर्डर','উপলব্ধ Parking অর্ডার','ઉપલબ્ધ Parking ઓર્ડર','கிடைக்கும் Parking Orders','Available Parking Orders','دستیاب Parking Orders','ਉਪਲਬਧ Parking Orders','ଉପଲବ୍ଧ Parking Orders','అందుబాటులో Parking Orders'],
  'Amount to lock (INR)':['Amount to lock (INR)','लॉक करने की राशि (INR)','লক করার পরিমাণ (INR)','લૉક કરવાની રકમ (INR)','Lock செய்ய வேண்டிய தொகை (INR)','Amount to lock (INR)','لاک کرنے کی رقم (INR)','ਲੌਕ ਕਰਨ ਦੀ ਰਕਮ (INR)','lock କରିବା ରାଶି (INR)','లాక్ చేయాల్సిన మొత్తం (INR)'],
  'No eligible Parking orders.':['No eligible Parking orders.','कोई पात्र Parking ऑर्डर नहीं।','কোনো যোগ্য Parking অর্ডার নেই।','કોઈ પાત્ર Parking ઓર્ડર નથી.','தகுதியான Parking Orders இல்லை.','No eligible Parking orders.','کوئی اہل Parking order نہیں۔','ਕੋਈ ਯੋਗ Parking order ਨਹੀਂ।','କୌଣସି ଯୋଗ୍ୟ Parking order ନାହିଁ।','అర్హమైన Parking orders లేవు.'],
  'My Parking Payments':['My Parking Payments','मेरे Parking भुगतान','আমার Parking পেমেন্ট','મારા Parking પેમેન્ટ','என் Parking Payments','My Parking Payments','میری Parking ادائیگیاں','ਮੇਰੇ Parking ਭੁਗਤਾਨ','ମୋ Parking Payments','నా Parking Payments'],
  'I paid · Send to review':['I paid · Send to review','मैंने भुगतान किया · समीक्षा के लिए भेजें','আমি পেমেন্ট করেছি · রিভিউতে পাঠান','મેં પેમેન્ટ કર્યું · રિવ્યૂ માટે મોકલો','நான் செலுத்தினேன் · review-க்கு அனுப்பவும்','I paid · Send to review','میں نے ادا کیا · review کیلئے بھیجیں','ਮੈਂ ਭੁਗਤਾਨ ਕੀਤਾ · review ਲਈ ਭੇਜੋ','ମୁଁ payment କରିଛି · review ପାଇଁ ପଠାନ୍ତୁ','నేను చెల్లించాను · review కి పంపండి'],
  'Release lock':['Release lock','लॉक छोड़ें','লক ছাড়ুন','લૉક છોડો','Lock விடுவிக்கவும்','Release lock','لاک چھوڑیں','ਲੌਕ ਛੱਡੋ','lock ଛାଡନ୍ତୁ','లాక్ విడుదల చేయండి'],
  'Pair WPay Agent using a code issued to your account. Each code connects one device.':['Pair WPay Agent using a code issued to your account. Each code connects one device.','अपने अकाउंट के कोड से WPay Agent pair करें। हर कोड एक डिवाइस जोड़ता है।','আপনার অ্যাকাউন্টের কোড দিয়ে WPay Agent pair করুন। প্রতিটি কোড একটি ডিভাইস যুক্ত করে।','તમારા એકાઉન્ટના કોડથી WPay Agent pair કરો. દરેક કોડ એક ડિવાઇસ જોડે છે.','உங்கள் account code மூலம் WPay Agent pair செய்யவும். ஒவ்வொரு code-மும் ஒரு device-ஐ இணைக்கும்.','Pair WPay Agent using a code issued to your account. Each code connects one device.','اپنے اکاؤنٹ کے کوڈ سے WPay Agent pair کریں۔ ہر کوڈ ایک ڈیوائس جوڑتا ہے۔','ਆਪਣੇ ਅਕਾਊਂਟ ਦੇ ਕੋਡ ਨਾਲ WPay Agent pair ਕਰੋ। ਹਰ ਕੋਡ ਇੱਕ ਡਿਵਾਈਸ ਜੋੜਦਾ ਹੈ।','ଆପଣଙ୍କ account code ଦ୍ୱାରା WPay Agent pair କରନ୍ତୁ। ପ୍ରତ୍ୟେକ code ଗୋଟିଏ device ଯୋଡେ।','మీ అకౌంట్ కోడ్‌తో WPay Agent pair చేయండి. ప్రతి కోడ్ ఒక device ను కలుపుతుంది.'],
  'Your connected workspace':['Your connected workspace','आपका कनेक्टेड वर्कस्पेस','আপনার সংযুক্ত ওয়ার্কস্পেস','તમારું કનેક્ટેડ વર્કસ્પેસ','உங்கள் இணைக்கப்பட்ட workspace','Your connected workspace','آپ کا منسلک ورک اسپیس','ਤੁਹਾਡਾ ਕਨੈਕਟਡ ਵਰਕਸਪੇਸ','ଆପଣଙ୍କ connected workspace','మీ connected workspace'],
  'APK & version':['APK & version','APK और वर्ज़न','APK ও ভার্সন','APK અને વર્ઝન','APK & version','APK & version','APK اور ورژن','APK ਅਤੇ ਵਰਜਨ','APK ଓ version','APK & version'],
  'Activation code history':['Activation code history','एक्टिवेशन कोड हिस्ट्री','অ্যাক্টিভেশন কোড হিস্ট্রি','એક્ટિવેશન કોડ હિસ્ટ્રી','Activation code வரலாறு','Activation code history','Activation code ہسٹری','Activation code ਹਿਸਟਰੀ','Activation code history','Activation code హిస్టరీ'],
  'No activation codes issued yet.':['No activation codes issued yet.','अभी कोई एक्टिवेशन कोड जारी नहीं हुआ।','এখনও কোনো অ্যাক্টিভেশন কোড ইস্যু হয়নি।','હજુ કોઈ એક્ટિવેશન કોડ જારી થયો નથી.','இன்னும் activation code வழங்கப்படவில்லை.','No activation codes issued yet.','ابھی کوئی activation code جاری نہیں ہوا۔','ਹਾਲੇ ਕੋਈ activation code ਜਾਰੀ ਨਹੀਂ ਹੋਇਆ।','ଏଯାଏଁ activation code ଜାରି ହୋଇନାହିଁ।','ఇంకా activation code జారీ కాలేదు.'],
  'Waiting for GPS fix':['Waiting for GPS fix','GPS लोकेशन का इंतज़ार','GPS লোকেশনের অপেক্ষা','GPS લોકેશનની રાહ','GPS fix காத்திருக்கிறது','Waiting for GPS fix','GPS fix کا انتظار','GPS fix ਦੀ ਉਡੀਕ','GPS fix ପାଇଁ ଅପେକ୍ଷା','GPS fix కోసం వేచి ఉంది'],
  'Last known GPS':['Last known GPS','आखिरी ज्ञात GPS','সর্বশেষ জানা GPS','છેલ્લું જાણીતું GPS','கடைசியாக அறியப்பட்ட GPS','Last known GPS','آخری معلوم GPS','ਆਖਰੀ ਜਾਣਿਆ GPS','ଶେଷ ଜଣା GPS','చివరిగా తెలిసిన GPS'],
  'Load health & location history':['Load health & location history','हेल्थ और लोकेशन हिस्ट्री लोड करें','হেলথ ও লোকেশন হিস্ট্রি লোড করুন','હેલ્થ અને લોકેશન હિસ્ટ્રી લોડ કરો','Health & location history ஏற்றவும்','Load health & location history','Health اور location history لوڈ کریں','Health ਅਤੇ location history ਲੋਡ ਕਰੋ','Health ଓ location history ଲୋଡ୍ କରନ୍ତୁ','Health & location history లోడ్ చేయండి'],
  'No diagnostics available for this pairing.':['No diagnostics available for this pairing.','इस pairing के लिए diagnostics उपलब्ध नहीं हैं।','এই pairing-এর জন্য diagnostics নেই।','આ pairing માટે diagnostics ઉપલબ્ધ નથી.','இந்த pairing-க்கு diagnostics இல்லை.','No diagnostics available for this pairing.','اس pairing کیلئے diagnostics دستیاب نہیں۔','ਇਸ pairing ਲਈ diagnostics ਉਪਲਬਧ ਨਹੀਂ।','ଏହି pairing ପାଇଁ diagnostics ନାହିଁ।','ఈ pairing కోసం diagnostics లేవు.'],
  'No events for these filters.':['No events for these filters.','इन फिल्टर के लिए कोई इवेंट नहीं।','এই ফিল্টারের জন্য কোনো ইভেন্ট নেই।','આ ફિલ્ટર માટે કોઈ ઇવેન્ટ નથી.','இந்த filter-க்கு event இல்லை.','No events for these filters.','ان filters کیلئے کوئی event نہیں۔','ਇਨ੍ਹਾਂ filters ਲਈ ਕੋਈ event ਨਹੀਂ।','ଏହି filters ପାଇଁ କୌଣସି event ନାହିଁ।','ఈ filters కోసం events లేవు.'],
  'Older events':['Older events','पुराने इवेंट','পুরোনো ইভেন্ট','જૂના ઇવેન્ટ','பழைய events','Older events','پرانے events','ਪੁਰਾਣੇ events','ପୁରୁଣା events','పాత events'],
  'Refresh masked events':['Refresh masked events','मास्क्ड इवेंट रिफ्रेश करें','মাস্কড ইভেন্ট রিফ্রেশ করুন','માસ્ક્ડ ઇવેન્ટ રિફ્રેશ કરો','Masked events புதுப்பிக்கவும்','Refresh masked events','Masked events ریفریش کریں','Masked events ਰਿਫ੍ਰੈਸ਼ ਕਰੋ','Masked events refresh କରନ୍ତୁ','Masked events రిఫ్రెష్ చేయండి'],
  'Date / time':['Date / time','तारीख / समय','তারিখ / সময়','તારીખ / સમય','தேதி / நேரம்','Date / time','تاریخ / وقت','ਤਾਰੀਖ / ਸਮਾਂ','ତାରିଖ / ସମୟ','తేదీ / సమయం'],
  'APK / device':['APK / device','APK / डिवाइस','APK / ডিভাইস','APK / ડિવાઇસ','APK / சாதனம்','APK / device','APK / ڈیوائس','APK / ਡਿਵਾਈਸ','APK / ଡିଭାଇସ୍','APK / డివైస్'],
  'Phone number':['Phone number','फोन नंबर','ফোন নম্বর','ફોન નંબર','தொலைபேசி எண்','Phone number','فون نمبر','ਫੋਨ ਨੰਬਰ','ଫୋନ୍ ନମ୍ବର','ఫోన్ నంబర్'],
  'Masked message':['Masked message','मास्क्ड मैसेज','মাস্কড মেসেজ','માસ્ક્ડ મેસેજ','Masked message','Masked message','Masked message','Masked message','Masked message','Masked message'],
  'Get help with your account.':['Get help with your account.','अपने अकाउंट के लिए मदद लें।','আপনার অ্যাকাউন্টের জন্য সাহায্য নিন।','તમારા એકાઉન્ટ માટે મદદ મેળવો.','உங்கள் account-க்கு உதவி பெறுங்கள்.','Get help with your account.','اپنے اکاؤنٹ کیلئے مدد لیں۔','ਆਪਣੇ ਅਕਾਊਂਟ ਲਈ ਮਦਦ ਲਵੋ।','ଆପଣଙ୍କ account ପାଇଁ ସହାୟତା ନିଅନ୍ତୁ।','మీ అకౌంట్ కోసం సహాయం పొందండి.'],
  'Create a ticket describing the issue.':['Create a ticket describing the issue.','समस्या बताकर टिकट बनाएँ।','সমস্যা লিখে টিকিট তৈরি করুন।','સમસ્યા લખીને ટિકિટ બનાવો.','பிரச்சினையை விவரித்து ticket உருவாக்கவும்.','Create a ticket describing the issue.','مسئلہ بتا کر ticket بنائیں۔','ਮੁੱਦਾ ਦੱਸ ਕੇ ticket ਬਣਾਓ।','ସମସ୍ୟା ଲେଖି ticket ବନାନ୍ତୁ।','సమస్యను వివరించి ticket సృష్టించండి.'],
  'Do not include passwords or secret credentials.':['Do not include passwords or secret credentials.','पासवर्ड या गुप्त क्रेडेंशियल न दें।','পাসওয়ার্ড বা গোপন ক্রেডেনশিয়াল দেবেন না।','પાસવર્ડ અથવા ગુપ્ત ક્રેડેન્શિયલ ન આપો.','Password அல்லது secret credentials சேர்க்க வேண்டாம்.','Do not include passwords or secret credentials.','Password یا secret credentials شامل نہ کریں۔','Password ਜਾਂ secret credentials ਨਾ ਦਿਓ।','Password କିମ୍ବା secret credentials ଦିଅନ୍ତୁ ନାହିଁ।','Password లేదా secret credentials ఇవ్వవద్దు.']
 });

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
  document.documentElement.dir='ltr';
  document.body.classList.toggle('user-lang-ur',lang==='ur');
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
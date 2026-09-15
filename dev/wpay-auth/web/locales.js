"use strict";
(function(root) {
  const dictionaries = {
    en: {
      development:"Development — payments not connected", brandIntro:"Your WPay workspace", intro:"Start with an application", introBody:"Admin approval and authenticator verification are required before account access.",
      login:"Log in", register:"Register", registerTitle:"Create an application", loginTitle:"Welcome back", name:"Name", email:"Email / login", password:"Password", accountType:"Account type", user:"User", merchant:"Merchant", admin:"Admin", super_admin:"Super Admin", employee:"Employee",
      passwordHelp:"15–128 characters, up to 512 UTF-8 bytes. Passwords are not trimmed.", emailNote:"Email ownership is not verified by this development flow.", createAccount:"Submit application", switchRegister:"Create a development account", switchLogin:"Already registered? Log in", registered:"Application submitted. Wait for Admin approval before logging in.",
      account:"Account & onboarding", workspace:"Workspace", logout:"Log out", logoutAll:"Log out all sessions", loggedOut:"Logged out.", welcome:"Account details", loginStatus:"Login status", approval:"Business approval", operations:"Payment operations", unavailable:"Unavailable", pending:"Pending", approved:"Approved", rejected:"Rejected", active:"Active", suspended:"Suspended", disabled:"Disabled", onboarding:"Approval permits login only. Deposit, statement and UPI prerequisites still gate financial operations.",
      settings:"Settings", language:"Language", languageSaved:"Language saved.", security:"Security / Two-Factor Authentication", securityEnabled:"Authenticator enabled", sessions:"Active sessions", created:"Created", lastSeen:"Last activity", current:"This session", expires:"Expires", replace:"Replace authenticator", regenerate:"Regenerate recovery codes", stepup:"Verify for sensitive actions", freshHelp:"Enter your password and a fresh authenticator code. Previously accepted codes cannot be reused.",
      mfaTitle:"Authenticator verification", enrollTitle:"Set up your authenticator", enrollHelp:"Scan this locally generated QR in your authenticator, or enter the setup key manually. Never share the key.", setupKey:"Manual setup key", code:"Six-digit code", verify:"Verify code", recovery:"Use a recovery code", recoveryHelp:"Password plus a recovery code starts restricted authenticator replacement. It does not grant panel access.", recoveryCode:"Recovery code", recover:"Replace using recovery proof", recoveryTitle:"Save your recovery codes", recoverySave:"Save these single-use codes privately. They will not be displayed again.", saved:"I saved the recovery codes", backLogin:"Return to login", continue:"Continue", loading:"Loading…", qrAlt:"Authenticator enrollment QR — secret, do not share",
      pendingUsers:"Pending Users", pendingMerchants:"Pending Merchants", pendingList:"Actual development applications. Approval saves commercial settings atomically; it does not activate payments.", noAccounts:"No pending applications on this page.", previous:"Previous", next:"Next", approve:"Approve", reject:"Reject", review:"Review application", reason:"Rejection reason", cancel:"Cancel", saveApproval:"Save approval", decisionSaved:"Decision saved.",
      payinCommission:"Pay-in commission %", payoutCommission:"Payout commission %", inrPerUsdt:"Fixed rate — INR per USDT", depositNetwork:"USDT deposit network", depositAddress:"Assigned USDT deposit address", payinFee:"Pay-in fee %", payoutFee:"Payout fee %", fixedPayoutFee:"Fixed fee per payout", fixedFeeCurrency:"Fixed-fee currency", currencyMissing:"Fixed-fee currency is not configured. Merchant approval is unavailable.",
      planned:"Not implemented — payments not connected", plannedBody:"This destination is reserved for a later task.", noMoney:"No live financial operations", noKeys:"No API keys or payments are generated here.",
      "group.overview":"Overview", "group.settings":"Settings", "group.developer_api":"Developer / API", "group.users":"Users", "group.merchants":"Merchants", "group.support":"Support", "group.collections":"Collections", "group.finance":"Finance", "group.routing":"Routing",
      "nav.profile.view":"Profile", "nav.profile.update":"Edit profile", "nav.user.overview.view":"User dashboard", "nav.merchant.overview.view":"Merchant dashboard", "nav.overview.view":"Admin overview", "nav.support.view":"Support", "nav.guide.view":"Guide", "nav.merchant.api_docs.view":"API documentation", "nav.account_security.view":"Security / Two-Factor Authentication", "nav.users.view":"User directory", "nav.merchants.view":"Merchant directory",
      "error.INVALID_INPUT":"Check the request fields and required formats.", "error.AUTH_FAILED":"Authentication failed.", "error.APPROVAL_PENDING":"Your application is awaiting Admin approval. Panel and MFA access are unavailable until approval.", "error.MFA_FAILED":"Verification failed. Use a valid, unused code or log in again if the challenge expired.", "error.RECENT_MFA_REQUIRED":"Verify your password and a fresh authenticator code in Security first.", "error.FORBIDDEN":"Access denied.", "error.CSRF_FAILED":"Request verification failed. Refresh and try again.", "error.REGISTRATION_FAILED":"Registration could not be completed.", "error.RATE_LIMITED":"Too many attempts. Try again later.", "error.UNAVAILABLE":"Development authentication is unavailable.", "error.CONFLICT":"The application changed or this request conflicts with an earlier decision.", "error.NOT_FOUND":"Not implemented — payments not connected.", "error.BODY_TOO_LARGE":"Request is too large.", "error.METHOD_NOT_ALLOWED":"Method not allowed."
    },
    ru: {
      development:"Разработка — платежи не подключены", brandIntro:"Ваш кабинет WPay", intro:"Начните с заявки", introBody:"Для доступа необходимы одобрение администратора и проверка в приложении-аутентификаторе.",
      login:"Войти", register:"Регистрация", registerTitle:"Создать заявку", loginTitle:"С возвращением", name:"Имя", email:"Эл. почта / логин", password:"Пароль", accountType:"Тип аккаунта", user:"Пользователь", merchant:"Мерчант", admin:"Администратор", super_admin:"Суперадминистратор", employee:"Сотрудник",
      passwordHelp:"15–128 символов, не более 512 байт UTF-8. Пробелы в пароле сохраняются.", emailNote:"В этой тестовой версии владение почтовым ящиком не подтверждается.", createAccount:"Отправить заявку", switchRegister:"Создать тестовый аккаунт", switchLogin:"Уже зарегистрированы? Войти", registered:"Заявка отправлена. Дождитесь одобрения администратора перед входом.",
      account:"Аккаунт и подключение", workspace:"Кабинет", logout:"Выйти", logoutAll:"Завершить все сеансы", loggedOut:"Вы вышли из аккаунта.", welcome:"Данные аккаунта", loginStatus:"Статус входа", approval:"Одобрение заявки", operations:"Платёжные операции", unavailable:"Недоступно", pending:"Ожидает одобрения", approved:"Одобрено", rejected:"Отклонено", active:"Активен", suspended:"Приостановлен", disabled:"Отключён", onboarding:"Одобрение разрешает только вход. Финансовые операции по-прежнему требуют выполнения условий по депозиту, выписке и UPI.",
      settings:"Настройки", language:"Язык", languageSaved:"Язык сохранён.", security:"Безопасность / Двухфакторная аутентификация", securityEnabled:"Аутентификатор включён", sessions:"Активные сеансы", created:"Создан", lastSeen:"Последняя активность", current:"Текущий сеанс", expires:"Истекает", replace:"Заменить аутентификатор", regenerate:"Создать новые коды восстановления", stepup:"Подтвердить важные действия", freshHelp:"Введите пароль и новый код аутентификатора. Ранее принятые коды нельзя использовать повторно.",
      mfaTitle:"Проверка аутентификатора", enrollTitle:"Настройте аутентификатор", enrollHelp:"Отсканируйте локально созданный QR-код в приложении-аутентификаторе или введите ключ вручную. Никому не передавайте ключ.", setupKey:"Ключ для ручной настройки", code:"Шестизначный код", verify:"Проверить код", recovery:"Использовать код восстановления", recoveryHelp:"Пароль и код восстановления разрешают только замену аутентификатора. Доступ к кабинету ещё не предоставляется.", recoveryCode:"Код восстановления", recover:"Начать восстановление", recoveryTitle:"Сохраните коды восстановления", recoverySave:"Сохраните одноразовые коды в безопасном месте. Они больше не будут показаны.", saved:"Я сохранил коды восстановления", backLogin:"Вернуться ко входу", continue:"Продолжить", loading:"Загрузка…", qrAlt:"Секретный QR-код настройки аутентификатора — не передавайте его другим",
      pendingUsers:"Заявки пользователей", pendingMerchants:"Заявки мерчантов", pendingList:"Реальные тестовые заявки. Одобрение сохраняет коммерческие настройки одной операцией, но не активирует платежи.", noAccounts:"На этой странице нет ожидающих заявок.", previous:"Назад", next:"Далее", approve:"Одобрить", reject:"Отклонить", review:"Рассмотреть заявку", reason:"Причина отклонения", cancel:"Отмена", saveApproval:"Сохранить одобрение", decisionSaved:"Решение сохранено.",
      payinCommission:"Комиссия за входящие платежи, %", payoutCommission:"Комиссия за выплаты, %", inrPerUsdt:"Фиксированный курс — INR за USDT", depositNetwork:"Сеть депозита USDT", depositAddress:"Назначенный адрес депозита USDT", payinFee:"Сбор за входящие платежи, %", payoutFee:"Сбор за выплаты, %", fixedPayoutFee:"Фиксированный сбор за выплату", fixedFeeCurrency:"Валюта фиксированного сбора", currencyMissing:"Валюта фиксированного сбора не настроена. Одобрение мерчанта недоступно.",
      planned:"Не реализовано — платежи не подключены", plannedBody:"Этот раздел будет реализован в следующей задаче.", noMoney:"Реальные финансовые операции недоступны", noKeys:"Здесь не создаются API-ключи или платежи.",
      "group.overview":"Обзор", "group.settings":"Настройки", "group.developer_api":"Разработчикам / API", "group.users":"Пользователи", "group.merchants":"Мерчанты", "group.support":"Поддержка", "group.collections":"Приём платежей", "group.finance":"Финансы", "group.routing":"Маршрутизация",
      "nav.profile.view":"Профиль", "nav.profile.update":"Изменить профиль", "nav.user.overview.view":"Кабинет пользователя", "nav.merchant.overview.view":"Кабинет мерчанта", "nav.overview.view":"Обзор администратора", "nav.support.view":"Поддержка", "nav.guide.view":"Руководство", "nav.merchant.api_docs.view":"Документация API", "nav.account_security.view":"Безопасность / Двухфакторная аутентификация", "nav.users.view":"Каталог пользователей", "nav.merchants.view":"Каталог мерчантов",
      "error.INVALID_INPUT":"Проверьте поля и требуемые форматы.", "error.AUTH_FAILED":"Ошибка аутентификации.", "error.APPROVAL_PENDING":"Заявка ожидает одобрения администратора. До одобрения кабинет и настройка MFA недоступны.", "error.MFA_FAILED":"Проверка не пройдена. Используйте действующий неиспользованный код или войдите заново, если время проверки истекло.", "error.RECENT_MFA_REQUIRED":"Сначала подтвердите пароль и новый код аутентификатора в разделе безопасности.", "error.FORBIDDEN":"Доступ запрещён.", "error.CSRF_FAILED":"Проверка запроса не пройдена. Обновите страницу и повторите попытку.", "error.REGISTRATION_FAILED":"Не удалось завершить регистрацию.", "error.RATE_LIMITED":"Слишком много попыток. Повторите позже.", "error.UNAVAILABLE":"Тестовая аутентификация недоступна.", "error.CONFLICT":"Заявка изменилась или запрос противоречит предыдущему решению.", "error.NOT_FOUND":"Не реализовано — платежи не подключены.", "error.BODY_TOO_LARGE":"Запрос слишком большой.", "error.METHOD_NOT_ALLOWED":"Метод не разрешён."
    },
    "zh-CN": {
      development:"开发环境 — 尚未连接支付", brandIntro:"您的 WPay 工作区", intro:"从提交申请开始", introBody:"访问账户前，需要管理员批准并通过身份验证器验证。",
      login:"登录", register:"注册", registerTitle:"创建申请", loginTitle:"欢迎回来", name:"姓名", email:"电子邮箱 / 登录名", password:"密码", accountType:"账户类型", user:"用户", merchant:"商户", admin:"管理员", super_admin:"超级管理员", employee:"员工",
      passwordHelp:"15–128 个字符，最多 512 个 UTF-8 字节。密码中的空格会保留。", emailNote:"此开发流程不会验证邮箱所有权。", createAccount:"提交申请", switchRegister:"创建开发账户", switchLogin:"已有账户？登录", registered:"申请已提交。请等待管理员批准后再登录。",
      account:"账户与开户流程", workspace:"工作区", logout:"退出登录", logoutAll:"退出所有会话", loggedOut:"已退出登录。", welcome:"账户详情", loginStatus:"登录状态", approval:"业务审批", operations:"支付操作", unavailable:"不可用", pending:"待审批", approved:"已批准", rejected:"已拒绝", active:"正常", suspended:"已暂停", disabled:"已停用", onboarding:"批准仅允许登录。金融操作仍需满足充值、对账单和 UPI 等前提条件。",
      settings:"设置", language:"语言", languageSaved:"语言已保存。", security:"安全 / 双重身份验证", securityEnabled:"身份验证器已启用", sessions:"活跃会话", created:"创建时间", lastSeen:"最近活动", current:"当前会话", expires:"到期时间", replace:"更换身份验证器", regenerate:"重新生成恢复码", stepup:"验证敏感操作", freshHelp:"请输入密码和新的身份验证器验证码。已使用的验证码不能重复使用。",
      mfaTitle:"身份验证器验证", enrollTitle:"设置身份验证器", enrollHelp:"使用身份验证器扫描本地生成的二维码，或手动输入设置密钥。请勿分享密钥。", setupKey:"手动设置密钥", code:"六位验证码", verify:"验证", recovery:"使用恢复码", recoveryHelp:"密码和恢复码仅允许进入受限的身份验证器更换流程，不会直接授予工作区访问权限。", recoveryCode:"恢复码", recover:"开始恢复", recoveryTitle:"保存恢复码", recoverySave:"请妥善保存这些一次性恢复码。之后将不会再次显示。", saved:"我已保存恢复码", backLogin:"返回登录", continue:"继续", loading:"加载中…", qrAlt:"身份验证器设置二维码 — 包含密钥，请勿分享",
      pendingUsers:"待审批用户", pendingMerchants:"待审批商户", pendingList:"真实的开发申请。批准会以原子操作保存商业设置，但不会启用支付。", noAccounts:"此页没有待审批申请。", previous:"上一页", next:"下一页", approve:"批准", reject:"拒绝", review:"审核申请", reason:"拒绝原因", cancel:"取消", saveApproval:"保存批准", decisionSaved:"审核决定已保存。",
      payinCommission:"收款佣金百分比", payoutCommission:"付款佣金百分比", inrPerUsdt:"固定汇率 — 每 USDT 对应的 INR", depositNetwork:"USDT 充值网络", depositAddress:"分配的 USDT 充值地址", payinFee:"收款费率百分比", payoutFee:"付款费率百分比", fixedPayoutFee:"每笔付款固定费用", fixedFeeCurrency:"固定费用币种", currencyMissing:"尚未配置固定费用币种，无法批准商户。",
      planned:"尚未实现 — 尚未连接支付", plannedBody:"此功能将在后续任务中实现。", noMoney:"不支持真实金融操作", noKeys:"此处不会生成 API 密钥或支付。",
      "group.overview":"概览", "group.settings":"设置", "group.developer_api":"开发者 / API", "group.users":"用户", "group.merchants":"商户", "group.support":"支持", "group.collections":"收款", "group.finance":"财务", "group.routing":"路由",
      "nav.profile.view":"个人资料", "nav.profile.update":"编辑资料", "nav.user.overview.view":"用户工作台", "nav.merchant.overview.view":"商户工作台", "nav.overview.view":"管理概览", "nav.support.view":"支持", "nav.guide.view":"指南", "nav.merchant.api_docs.view":"API 文档", "nav.account_security.view":"安全 / 双重身份验证", "nav.users.view":"用户目录", "nav.merchants.view":"商户目录",
      "error.INVALID_INPUT":"请检查输入字段和格式。", "error.AUTH_FAILED":"身份验证失败。", "error.APPROVAL_PENDING":"申请正在等待管理员批准。批准前无法访问工作区或设置 MFA。", "error.MFA_FAILED":"验证失败。请使用有效且未使用过的验证码；若验证流程已过期，请重新登录。", "error.RECENT_MFA_REQUIRED":"请先在安全设置中验证密码和新的身份验证器验证码。", "error.FORBIDDEN":"无访问权限。", "error.CSRF_FAILED":"请求验证失败。请刷新页面后重试。", "error.REGISTRATION_FAILED":"无法完成注册。", "error.RATE_LIMITED":"尝试次数过多，请稍后再试。", "error.UNAVAILABLE":"开发环境身份验证暂不可用。", "error.CONFLICT":"申请状态已更改，或请求与之前的决定冲突。", "error.NOT_FOUND":"尚未实现 — 尚未连接支付。", "error.BODY_TOO_LARGE":"请求过大。", "error.METHOD_NOT_ALLOWED":"不允许此方法。"
    }
  };
  const merchantLabels = {
    "group.payouts_withdrawals": ["Payouts & withdrawals","Выплаты и вывод средств","付款与提现"],
    "nav.merchant.analytics.view": ["Analytics","Аналитика","数据分析"],
    "nav.merchant.collections.create": ["Create payment link","Создать платёжную ссылку","创建支付链接"],
    "nav.merchant.collections.view": ["Payment orders","Платёжные заказы","支付订单"],
    "nav.merchant.transactions.view": ["All transactions","Все транзакции","全部交易"],
    "nav.merchant.payouts.inr.create": ["INR payout","Выплата в INR","INR 付款"],
    "nav.merchant.payouts.usdt.create": ["USDT payout","Выплата в USDT","USDT 付款"],
    "nav.merchant.withdrawals.usdt.create": ["USDT withdrawal","Вывод USDT","USDT 提现"],
    "nav.merchant.payouts.view": ["Payout history","История выплат","付款记录"],
    "nav.merchant.ledger.view": ["Balance & ledger","Баланс и журнал операций","余额与账本"],
    "nav.merchant.fees.view": ["Platform fees","Комиссии платформы","平台费用"],
    "nav.merchant.holds.view": ["Held / frozen funds","Удержанные / замороженные средства","待处理 / 冻结资金"],
    "nav.merchant.api_credentials.view": ["API credentials","Учётные данные API","API 凭据"],
    "nav.merchant.webhooks.view": ["Webhooks","Вебхуки","Webhook"],
    "nav.merchant.api_logs.view": ["API logs","Журналы API","API 日志"],
    "nav.notifications.view": ["Notifications","Уведомления","通知"],
    "nav.merchant.security.view": ["Merchant security","Безопасность мерчанта","商户安全"]
  };
  for (const [key,values] of Object.entries(merchantLabels)) ["en","ru","zh-CN"].forEach((locale,index) => { dictionaries[locale][key] = values[index]; });
  const integrationLabels={
    "group.apk_events":["APK & Events","APK и события","APK 与事件"],
    "nav.user.apk.view":["Download APK","Скачать APK","下载 APK"],"nav.apk.view":["APK artifact","Файл APK","APK 文件"],
    "nav.user.source_events.view":["Linked Devices & Observations","Связанные устройства и события","已关联设备与记录"],
    "nav.merchant.source_events.view":["Mapped Orders","Связанные заказы","已关联订单"],
    apkTitle:["WPAY Agent APK","APK агента WPAY","WPAY Agent APK"],version:["Version / build","Версия / сборка","版本 / 构建"],
    package:["Android package","Пакет Android","Android 软件包"],minimumAndroid:["Minimum Android API","Минимальный API Android","最低 Android API"],
    fileSize:["File size (bytes)","Размер файла (байт)","文件大小（字节）"],sha256:["SHA-256","SHA-256","SHA-256"],
    apkSigner:["Signing certificate","Сертификат подписи","签名证书"],refreshedAt:["Metadata refreshed","Метаданные обновлены","元数据刷新时间"],
    downloadApk:["Download verified APK bytes","Скачать проверенный APK","下载已验证的 APK"],
    apkEvidence:["Existing APK; manifest and signature checked for this SHA-256. The existing Android debug signature is preserved.","Существующий APK: манифест и подпись проверены для этого SHA-256. Сохранена исходная отладочная подпись Android.","现有 APK 的清单和签名已按此 SHA-256 验证；保留原有 Android 调试签名。"],
    linkedSources:["Linked devices and observations","Связанные устройства и события","关联设备与记录"],mappedOrders:["Mapped orders","Связанные заказы","已关联订单"],
    sourceDisconnected:["Device/source not connected","Устройство / источник не подключён","设备 / 数据源未连接"],
    sourceScopeRequired:["Only independently verified owner mappings allow source access.","Доступ возможен только после независимой проверки владельца.","仅经独立验证的归属关联可访问数据源。"],
    observationOnly:["Captured events, submitted UTRs and legacy match results are observations. They do not confirm WPay accounting or settlement. Matching, collections and financial posting remain unavailable.","События, переданные UTR и результаты старого сопоставления — только наблюдения. Они не подтверждают учёт или расчёт WPay. Сопоставление, сбор платежей и проводки недоступны.","采集事件、提交的 UTR 和旧系统匹配结果仅为记录，不代表 WPay 已记账或结算。匹配、收款和财务入账暂不可用。"],
    resourceKind:["Resource type","Тип ресурса","资源类型"],resourceReference:["Resource reference (no credentials)","Идентификатор ресурса (без секретов)","资源编号（不含凭据）"],
    sourceConsent:["I consent to ownership verification for this resource. This request grants no data access.","Я согласен на проверку владения этим ресурсом. Заявка не даёт доступа к данным.","我同意验证此资源的归属。提交申请不会授予数据访问权限。"],
    requestLink:["Request ownership verification","Запросить проверку владения","申请归属验证"],linkPending:["Request recorded; independent ownership verification is still required.","Заявка сохранена; требуется независимая проверка владельца.","申请已记录；仍需独立验证归属。"],
    revokeLink:["Revoke access","Отозвать доступ","撤销访问"],"link.pending":["Unverified request","Непроверенная заявка","未验证申请"],"link.verified":["Verified owner mapping","Владелец проверен","已验证归属"],
    "kind.device":["Device","Устройство","设备"],"kind.receiving_account":["Receiving account","Счёт получателя","收款账户"],"kind.statement_import":["Statement import","Импорт выписки","账单导入"],
    "kind.order":["Order","Заказ","订单"],"kind.payment_link":["Payment link","Платёжная ссылка","付款链接"],"kind.merchant_assignment":["Merchant assignment","Назначение мерчанта","商户分配"],
    "view.device":["Device last seen","Последняя связь устройства","设备最后在线记录"],"view.otp":["Masked OTP event metadata","Метаданные OTP без кодов","已遮蔽的 OTP 事件元数据"],
    "view.transactions":["Captured transaction observations","Наблюдения транзакций","已采集的交易记录"],"view.statement":["Statement results","Результаты выписки","账单结果"],"view.order":["Order observations","Наблюдения заказа","订单记录"],
    lastSeen:["Last seen","Последняя связь","最后在线时间"],deviceStatus:["Reported device status","Статус устройства в источнике","数据源报告的设备状态"],
    noSourceRows:["No observations in the authorized scope.","Нет событий в разрешённой области.","授权范围内没有记录。"],backSources:["Back to linked sources","К связанным источникам","返回关联数据源"]
  };
  Object.assign(integrationLabels,{
    "event.id":["Event reference","Номер события","事件编号"],"event.code":["Masked code","Скрытый код","已遮蔽验证码"],
    "event.sms_received_at":["Received at","Время получения","接收时间"],"event.created_at":["Recorded at","Время записи","记录时间"],
    "event.amount":["Reported amount","Сумма в источнике","报告金额"],"event.utr":["Observed UTR","UTR в источнике","数据源中的 UTR"],
    "event.submitted_utr":["Customer-submitted UTR","UTR от клиента","客户提交的 UTR"],"event.legacy_status":["Legacy reported status","Статус старой системы","旧系统报告状态"],
    "event.matched_at":["Legacy match reported at","Время сопоставления в старой системе","旧系统报告匹配时间"],
    "event.verified_at":["Legacy verification reported at","Время проверки в старой системе","旧系统报告验证时间"]
  });
  Object.assign(integrationLabels, {
    "group.bank_upi":["Bank & UPI","Банк и UPI","银行与 UPI"],
    "nav.user.bank_upi.submit":["Bank & UPI","Банк и UPI","银行与 UPI"],
    "nav.user.payin_commission.view":["Commission ledger","Журнал комиссии","佣金账本"],
    "nav.user.holds.view":["Holds / Frozen","Удержания / заморозка","冻结金额"],
    "nav.bank_upi.view":["Bank / UPI Reviews","Проверка банка / UPI","银行 / UPI 审核"],
    "nav.routing.view":["Routing & reservations","Маршрутизация и резервирования","路由与预留"],
    "nav.ledger.view":["Ledger explorer","Журнал операций","账本浏览"],
    "nav.holds.view":["Holds / Frozen","Удержания / заморозка","冻结金额"],
    "nav.assignments.view":["User Assignment","Назначение пользователей","用户分配"],
    "error.NO_ROUTE":["No eligible route is available.","Нет подходящего маршрута.","暂无符合条件的路由。"],
    "error.INSUFFICIENT_CAPACITY":["Available capacity is insufficient.","Недостаточно доступного лимита.","可用容量不足。"],
    hosted:["WPay — payments not connected","WPay — платежи не подключены","WPay — 尚未连接支付"],
    emailNote:["Email ownership is not verified by this application flow.","Владение почтовым ящиком в этом процессе не подтверждается.","此申请流程不验证电子邮箱所有权。"],
    switchRegister:["Create an account","Создать аккаунт","创建账户"],
    pendingList:["Approval saves commercial settings atomically; it does not activate payments.","Одобрение сохраняет коммерческие настройки одной операцией, но не активирует платежи.","批准会以原子操作保存商业设置，但不会启用支付。"],
    "error.UNAVAILABLE":["Authentication or the requested source is unavailable.","Аутентификация или запрошенный источник недоступны.","身份验证或请求的数据源不可用。"]
  });
  for(const [key,values] of Object.entries(integrationLabels))["en","ru","zh-CN"].forEach((language,index)=>{dictionaries[language][key]=values[index];});
  ["en","ru","zh-CN"].forEach((language,index)=>{dictionaries[language]["nav.user.deposits.view"]=["USDT Deposit","Депозит USDT","USDT 入金"][index];dictionaries[language]["nav.deposits.view"]=["USDT Deposit Review","Проверка депозитов USDT","USDT 入金审核"][index];});
  const fundingErrors={
    BELOW_MINIMUM:["Below 2,000 USDT; the transfer remains in review.","Меньше 2 000 USDT; перевод сохранён для проверки.","低于 2,000 USDT；转账保留供审核。"],
    UNREPRESENTABLE_AMOUNT:["The exact INR amount cannot be represented; review is required.","Точную сумму INR нельзя представить; требуется проверка.","无法精确表示 INR 金额；须审核。"],
    EVIDENCE_REVIEW:["Transfer evidence needs independent review.","Доказательства перевода требуют независимой проверки.","转账证据须独立审核。"],
    DUPLICATE_TRANSFER:["Transfer already belongs to another request.","Перевод уже относится к другому запросу.","该转账已归属于另一申请。"],
    AMBIGUOUS_TRANSFER:["Transfer ownership is ambiguous; review is required.","Принадлежность перевода неоднозначна; требуется проверка.","转账归属不明确；须审核。"]
  };
  for(const [key,values] of Object.entries(fundingErrors))["en","ru","zh-CN"].forEach((language,index)=>{dictionaries[language]["error."+key]=values[index];});
  const supported = Object.freeze(["en","ru","zh-CN"]);
  function browserLocale(value) { const lower = String(value || "").toLowerCase(); return lower.startsWith("ru") ? "ru" : ["zh-cn","zh-hans","zh-hans-cn"].includes(lower) ? "zh-CN" : "en"; }
  function choose(explicit, saved, browser) { return supported.includes(explicit) ? explicit : supported.includes(saved) ? saved : browserLocale(browser); }
  function translate(locale,key) { return dictionaries[supported.includes(locale) ? locale : "en"][key] ?? dictionaries.en[key] ?? dictionaries.en.planned; }
  for (const dictionary of Object.values(dictionaries)) Object.freeze(dictionary);
  const api = Object.freeze({ dictionaries:Object.freeze(dictionaries),supported,choose,translate });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WPayLocales = api;
})(typeof globalThis === "undefined" ? this : globalThis);

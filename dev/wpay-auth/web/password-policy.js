'use strict';
(function(root){
 const words={
  establish:['8–128 characters, including A–Z, a–z, 0–9 and punctuation or a symbol. Maximum 512 UTF-8 bytes. Spaces do not count as symbols. Password bytes are not changed.','8–128 символов: A–Z, a–z, 0–9 и знак пунктуации или символ. Не более 512 байт UTF-8. Пробел не считается символом. Пароль не изменяется.','8–128 个字符，须包含 A–Z、a–z、0–9 以及标点或符号。最多 512 个 UTF-8 字节。空白不算符号，密码内容不会被修改。'],
  login:['Enter your existing password exactly as saved. Maximum 128 characters / 512 UTF-8 bytes.','Введите существующий пароль точно как сохранён. Не более 128 символов / 512 байт UTF-8.','请准确输入已保存的现有密码。最多 128 个字符 / 512 个 UTF-8 字节。'],
  privileged:['15–128 characters, up to 512 UTF-8 bytes. Passwords are not trimmed.','15–128 символов, не более 512 байт UTF-8. Пробелы не удаляются.','15–128 个字符，最多 512 个 UTF-8 字节。不会去除空白。'],
  change:['Change password','Изменить пароль','更改密码'],newPassword:['New password','Новый пароль','新密码'],confirmPassword:['Confirm new password','Повторите новый пароль','确认新密码'],
  changeHelp:['Your current password and a fresh authenticator code are required. Other sessions are invalidated; your authenticator and recovery codes stay unchanged.','Нужны текущий пароль и новый код аутентификатора. Другие сеансы будут завершены; аутентификатор и коды восстановления сохранятся.','需要当前密码和新的身份验证器验证码。其他会话将失效；身份验证器及恢复码保持不变。'],
  mismatch:['Passwords must match.','Пароли должны совпадать.','两次密码必须一致。']
 };
 const text=(locale,key)=>words[key][Math.max(0,['en','ru','zh-CN'].indexOf(locale))];
 function valid(value,kind='login'){
  if(typeof value!=='string'||!value.isWellFormed()||[...value].length<(kind==='privileged'?15:8)||[...value].length>128||new TextEncoder().encode(value).length>512)return false;
  return kind!=='establish'||(/[A-Z]/.test(value)&&/[a-z]/.test(value)&&/[0-9]/.test(value)&&/[\p{P}\p{S}]/u.test(value));
 }
 function bind(input,locale,kind){const check=()=>input.setCustomValidity(valid(input.value,kind)?'':text(locale,kind));input.addEventListener('input',check);check();return check;}
 const api={text,valid,bind};if(typeof module==='object'&&module.exports)module.exports=api;else root.WPayPasswordPolicy=api;
})(globalThis);

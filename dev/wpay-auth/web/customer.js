"use strict";
const base=location.pathname,$=id=>document.getElementById(id);
async function load(method='GET',body){const response=await fetch(base+(method==='GET'?'/status':'/claim'),{method,credentials:'omit',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unavailable');
 $('notice').textContent=data.synthetic?'TEST / DEV — synthetic acceptance only. Do not make a real payment.':data.verificationConnected?'Pay the exact amount before expiry.':'Payment verification source unavailable. Do not make a payment.';
 $('facts').replaceChildren();for(const [key,value] of Object.entries({Reference:data.reference,Amount:'INR '+(BigInt(data.amountMinor)/100n)+'.'+(BigInt(data.amountMinor)%100n).toString().padStart(2,'0'),Status:data.status,Expires:data.expiresAt})){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;$('facts').append(dt,dd);}
 $('payment').replaceChildren();if(data.qr){const img=document.createElement('img');img.src=data.qr;img.width=img.height=256;img.alt='UPI payment QR';const a=document.createElement('a');a.href=data.uri;a.textContent='Open UPI app';$('payment').append(img,a);}
 $('claim').hidden=['successful','failed','cancelled'].includes(data.status);$('status').textContent=data.evidenceStatus;
}
const error=e=>{$('status').textContent=e.message;$('payment').replaceChildren();};$('claim').onsubmit=async e=>{e.preventDefault();const utr=new FormData(e.target).get('utr');e.target.reset();try{await load('POST',{utr});}catch(e){error(e);}};load().catch(error);setInterval(()=>load().catch(error),5000);

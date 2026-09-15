"use strict";
const {createHash}=require('node:crypto'),{address}=require('../auth/runtime/commercial'),{AuthError}=require('../auth/runtime/errors'),money=require('../business/money');
const NETWORKS=Object.freeze({
 'ETHEREUM-ERC20':Object.freeze({chainId:'0x1',token:'0xdac17f958d2ee523a2206206994597c13d831ec7',decimals:6,finality:'finalized',confirmations:12}),
 'TRON-TRC20':Object.freeze({chainId:'0x2b6653dc',token:'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',decimals:6,finality:'solidified',confirmations:1})
});
const MINIMUM='2000000000';
function network(name){if(!Object.hasOwn(NETWORKS,name))throw new AuthError('INVALID_INPUT');return NETWORKS[name];}
function hash(name,value){network(name);const pattern=name==='ETHEREUM-ERC20'?/^0x[0-9a-f]{64}$/:/^[0-9a-f]{64}$/;if(typeof value!=='string'||!pattern.test(value))throw new AuthError('INVALID_INPUT');return value;}
function transferKey(name,tx,index){if(!Number.isInteger(index)||index<0||index>100000)throw new AuthError('INVALID_INPUT');return name+':'+network(name).token+':'+hash(name,tx)+':'+index;}
function evmAddress(name,value){address(name,value);if(name==='ETHEREUM-ERC20')return value.slice(2);const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const ch of value)n=n*58n+BigInt(alphabet.indexOf(ch));return n.toString(16).padStart(50,'0').slice(2,42);}
function conversion(amountMinor,rate){const n=money.minor(amountMinor)*BigInt(money.fromDecimal(rate,'USDT'));
 if(n%10000000000n!==0n)throw new AuthError('UNREPRESENTABLE_AMOUNT');return (n/10000000000n).toString();}
function binding(snapshot){return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');}
module.exports={NETWORKS,MINIMUM,network,hash,transferKey,evmAddress,conversion,binding};

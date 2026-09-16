"use strict";
const {fail}=require('./access');
function cursor(value){if(value===undefined||value===null)return '9223372036854775807';if(typeof value!=='string'||! /^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)fail('INVALID_INPUT');return value;}
module.exports={cursor};

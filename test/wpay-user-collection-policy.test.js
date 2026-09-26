'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),routing=require('../lib/wpay/business/routing');
const candidate={userStatus:'active',approval:'approved',authenticatorRequired:false,securityReady:true,deviceRequired:true,deviceEligible:true,operationsEnabled:true,funded:false,unlimitedCollection:true,assignmentActive:true,effectiveFrom:'2020-01-01T00:00:00Z',bankApproved:true,bankVerified:true,bankStatus:'running',bankFrozen:false,bankDeactivated:false,minMinor:'1',maxMinor:'10000',bankRemainingMinor:'10000',availableMinor:'0'};
test('unlimited collection exempts capacity only, preserving account, device and UPI limits',()=>{
 const eligible=changes=>routing.eligibility({...candidate,...changes},'5000',Date.now());
 assert.equal(eligible({}).eligible,true);
 assert.ok(eligible({unlimitedCollection:false}).reasons.includes('capacity_insufficient'));
 for(const changes of [{userStatus:'disabled'},{deviceEligible:false},{bankVerified:false},{bankFrozen:true},{operationsEnabled:false},{bankRemainingMinor:'4999'},{maxMinor:'4999'}])assert.equal(eligible(changes).eligible,false);
 assert.equal(eligible({unlimitedCollection:false,funded:true,availableMinor:'5000'}).eligible,true);
});

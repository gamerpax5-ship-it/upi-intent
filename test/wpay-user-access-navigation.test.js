'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ready,navigation}=require('../lib/wpay/panels/navigation');
test('implemented user access controls survive navigation filtering without exposing unrelated commercial pages',()=>{
 const page={destinationId:'administration.user-access',permissionId:'users.commercial.update',label:'User collection access'};
 assert.equal(ready(page),true);
 assert.equal(ready({...page,destinationId:'administration.unimplemented-commercial'}),false);
 assert.equal(ready({...page,permissionId:'unknown.permission'}),false);
 const result=navigation([{id:'users',children:[page]}],{principal:{type:'user'}});
 assert.equal(result[0].children[0].destinationId,page.destinationId);
 assert.equal(result[0].children[0].routeStatus,'implemented');
});

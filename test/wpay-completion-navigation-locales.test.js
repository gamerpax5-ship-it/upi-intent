"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {NAVIGATION_DEFINITION}=require('../lib/wpay/navigation');
const {ready}=require('../lib/wpay/panels/navigation');
const locales=require('../dev/wpay-auth/web/locales');
for(const language of locales.supported)test(`implemented navigation has explicit ${language} labels instead of planned fallback`,()=>{
  for(const group of NAVIGATION_DEFINITION){
    const pages=group.children.filter(ready);if(!pages.length)continue;
    for(const key of ['group.'+group.id.split('.').at(-1),...pages.map(page=>'nav.'+page.permissionId)]){
      assert.ok(Object.hasOwn(locales.dictionaries[language],key),`${language}: ${key}`);
      assert.notEqual(locales.translate(language,key),locales.dictionaries[language].planned);
    }
  }
});

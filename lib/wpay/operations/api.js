"use strict";
const {Devices}=require('./devices'),employees=require('./employees'),{fail}=require('./access');
const GET=['operations/devices','operations/employees','operations/transactions','operations/statements'],POST=['operations/devices','operations/device/create','operations/device/poll','operations/device/revoke','operations/otp','operations/employees','operations/employee/create','operations/employee/update','operations/transactions','operations/statements','operations/statement/upload'];
POST.push('operations/utr-source');
class Operations{
 constructor(options){this.devices=new Devices(options);this.reconciliation=new (require('./reconciliation').Reconciliation)(options);this.utrs=new (require('./legacy-utrs').LegacyUtrs)(options.legacyReader);}
 async run(client,row,context,operation,body){
  if(operation==='operations/utr-source')return this.utrs.read(client,row,context,body);
  if(operation==='operations/transactions')return this.reconciliation.observations(client,row,context,body);
  if(operation==='operations/statements'||operation==='operations/statement/upload')return this.reconciliation.statements(client,row,context,body,operation.endsWith('/upload'));
  if(operation==='operations/devices')return this.devices.list(client,row,context,body);
  if(operation==='operations/otp')return this.devices.events(client,row,context,body);
  if(operation==='operations/device/create')return this.devices.create(client,row,context,body);
  if(operation==='operations/device/poll')return this.devices.poll(client,row,context,body);
  if(operation==='operations/device/revoke')return this.devices.revoke(client,row,context,body);
  if(operation.startsWith('operations/employee'))return employees.run(client,row,context,operation,body);
  fail('NOT_FOUND');
 }
}
module.exports={Operations,GET,POST};

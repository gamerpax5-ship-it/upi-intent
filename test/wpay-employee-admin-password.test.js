"use strict";
const test=require('node:test');
test('Employee permanent and temporary passwords, optional login MFA, explicit delegation, tenant isolation and revocation on PostgreSQL',require('./helpers/wpay-employee-runtime'));

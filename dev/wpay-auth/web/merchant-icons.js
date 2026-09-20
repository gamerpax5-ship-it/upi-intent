(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const ICONS={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 chart:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
 link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
 orders:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
 transactions:'<path d="M4 7h16m-13-3L4 7l3 3m10 4 3 3-3 3M4 17h16"/>',
 payout:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8m-8 4h5"/>',
 review:'<path d="M9 4h6m-8 3h10a2 2 0 0 1 2 2v11H5V9a2 2 0 0 1 2-2Zm2 5h6m-6 4h4"/>',
 api:'<path d="M8 9 4 12l4 3m8-6 4 3-4 3m-3-9-2 12"/>',
 webhook:'<circle cx="12" cy="5" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="19" cy="16" r="2"/><path d="M12 7v4m-5 4 3-2m7 2-3-2"/>',
 logs:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
 docs:'<path d="M6 3h9l3 3v15H6V3Zm9 0v4h4M9 12h6m-6 4h6"/>',
 fees:'<circle cx="12" cy="12" r="8"/><path d="M12 7v10m3-8.5h-4.5a2 2 0 0 0 0 4H13a2 2 0 0 1 0 4H9"/>',
 ledger:'<path d="M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h5"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 settlement:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
 reports:'<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 support:'<path d="M4 5h16v12H9l-5 4V5Zm4 4h8m-8 4h5"/>',
 shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>',
 logout:'<path d="M10 17l5-5-5-5m5 5H3m12-9h5v18h-5"/>',
 wallet:'<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 coins:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 device:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M9 20h6m-3-4v4"/>'
};
const NAV={dashboard:'dashboard',analytics:'chart',links:'link',orders:'orders',transactions:'transactions',payouts:'payout','payout-review':'review',api:'api',webhooks:'webhook',logs:'logs',docs:'docs',fees:'fees',ledger:'ledger',holds:'lock',settlement:'settlement',reports:'reports',notifications:'bell',support:'support',security:'shield',profile:'user'};
function icon(n){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||ICONS.dashboard}</svg>`}
function hydrateIcons(){
  $$('.nav-item').forEach(n=>n.querySelector('.nav-icon').innerHTML=icon(NAV[n.dataset.page]||'dashboard'));
  $$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  $('#loginLogo').innerHTML='<svg viewBox="0 0 32 32" fill="none"><path d="M3 7.5 8.3 25 15.8 12.3 22 25 29 7.5h-6.1L20.6 17l-4.8-9.2L10.4 17 8.2 7.5H3Z" fill="white"/></svg>';
  $('#sideLogo').innerHTML=$('#loginLogo').innerHTML;
}
globalThis.WPayReferenceIcons={hydrate(scope){scope.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}};hydrateIcons();})();

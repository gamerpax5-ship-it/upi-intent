(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const ICONS={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 chart:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
 bank:'<path d="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3l9 5H3l9-5Z"/>',
 upi:'<path d="m5 7 4 5-4 5m7-10 4 5-4 5m7-10 2 5-2 5"/>',
 shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
 file:'<path d="M6 3h9l3 3v15H6V3Zm9 0v4h4M9 12h6m-6 4h6"/>',
 wallet:'<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4m-14 5 7 4 7-4"/>',
 coins:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
 withdraw:'<path d="M12 3v13m0 0 5-5m-5 5-5-5M5 21h14"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 history:'<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 3v5h5M12 8v5l3 2"/>',
 payout:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8m-8 4h5"/>',
 transactions:'<path d="M4 7h16m-13-3L4 7l3 3m10 4 3 3-3 3M4 17h16"/>',
 parking:'<path d="M7 21V3h7a5 5 0 0 1 0 10H7m0 0h7"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/>',
 device:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M9 20h6m-3-4v4"/>',
 qr:'<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
 trade:'<path d="m5 8 4-4 4 4m-4-4v12m10 0-4 4-4-4m4 4V8"/>',
 guide:'<circle cx="12" cy="12" r="9"/><path d="M12 10v6m0-9h.01"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 support:'<path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8m-8 4h5"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1Z"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
 send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11m16 2-2 4a7 7 0 0 1-12.5.5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 review:'<path d="M9 4h6m-8 3h10a2 2 0 0 1 2 2v11H5V9a2 2 0 0 1 2-2Zm2 5h6m-6 4h4"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
 moon:'<path d="M20.5 15.5A8 8 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 logout:'<path d="M10 17l5-5-5-5m5 5H3m12-9h5v18h-5"/>'
};
const PAGE_ICON={overview:'dashboard',analytics:'chart','bank-upi':'bank','upi-analytics':'chart','upi-verification':'shield',statements:'file','usdt-deposit':'wallet',commission:'coins',withdraw:'withdraw',holds:'lock',payins:'history',payouts:'payout',transactions:'transactions','parking-beneficiaries':'user','parking-orders':'parking',agent:'phone',activation:'qr',devices:'device',otp:'support',trade:'trade',guide:'guide',notifications:'bell',support:'support',security:'shield',settings:'settings',profile:'user'};
function svgIcon(name,cls=''){return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS.dashboard}</svg>`}
function hydrateIcons(){
  $$('.nav-item').forEach(el=>{const slot=el.querySelector('.ico');if(slot)slot.innerHTML=svgIcon(PAGE_ICON[el.dataset.page]||'dashboard')});
  $$('[data-icon]').forEach(el=>el.innerHTML=svgIcon(el.dataset.icon));
}

globalThis.WPayReferenceIcons={hydrate(scope){scope.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svgIcon(el.dataset.icon));}};hydrateIcons();})();

/* User-only navigation ergonomics. No requests, account data or permission changes. */
(function () {
  'use strict';
  if (!document.body.classList.contains('user-workspace')) return;
  const sidebar = document.getElementById('sidebar');
  const search = document.getElementById('globalSearch');
  const menu = document.getElementById('menuBtn');
  const overlay = document.getElementById('overlay');
  const workspace = document.getElementById('workspace') || document.getElementById('appView');
  if (!sidebar || !search || !workspace) return;
  const buttons = [...sidebar.querySelectorAll('.nav-item[data-page]')];
  const available = button => !button.disabled && button.getAttribute('aria-disabled') !== 'true' && !button.hidden;
  const label = button => button.textContent.trim().replace(/\s+/g, ' ');
  const group = button => button.closest('.nav-group')?.querySelector('.nav-title')?.textContent.trim() || 'Workspace';
  const visible = () => !workspace.hidden && !workspace.classList.contains('hidden');
  let matches = [], selected = -1;

  const results = document.createElement('div');
  results.id = 'user-section-results';
  results.className = 'search-results';
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-label', 'Available workspace sections');
  results.hidden = true;
  search.parentElement.append(results);
  const shortcut = document.createElement('kbd');
  shortcut.className = 'search-shortcut';
  shortcut.textContent = 'Ctrl K';
  shortcut.setAttribute('aria-hidden', 'true');
  search.parentElement.append(shortcut);
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-controls', results.id);
  search.setAttribute('aria-expanded', 'false');
  search.setAttribute('aria-label', 'Find a workspace section');
  search.autocomplete = 'off';
  search.placeholder = 'Find a section…';

  function closeSearch() {
    results.hidden = true;
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    selected = -1;
  }
  function selectMatch(index) {
    selected = index;
    [...results.querySelectorAll('[role=option]')].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) search.setAttribute('aria-activedescendant', 'user-section-option-' + index);
    else search.removeAttribute('aria-activedescendant');
  }
  function openMatch(index) {
    const button = matches[index];
    if (!button || !available(button) || !visible()) return closeSearch();
    closeSearch();
    search.value = '';
    button.click(); // Existing controller remains responsible for authorization and navigation.
    const heading = document.getElementById('page-title') || document.querySelector('.page.active h1');
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); }
  }
  function showSearch() {
    if (!visible()) return closeSearch();
    const query = search.value.trim().toLocaleLowerCase();
    matches = buttons.filter(button => available(button) && (label(button) + ' ' + group(button)).toLocaleLowerCase().includes(query)).slice(0, 8);
    results.replaceChildren();
    matches.forEach((button, i) => {
      const option = document.createElement('div');
      option.id = 'user-section-option-' + i;
      option.className = 'search-result';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const name = document.createElement('span'), category = document.createElement('small');
      name.textContent = label(button); category.textContent = group(button);
      option.append(name, category);
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => openMatch(i));
      results.append(option);
    });
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = query ? 'No available sections match. Try a section name such as Bank or Support.' : 'Your available sections will appear here after sign-in.';
      results.append(empty);
    }
    results.hidden = false;
    search.setAttribute('aria-expanded', 'true');
    selectMatch(matches.length ? 0 : -1);
  }
  search.addEventListener('focus', showSearch);
  search.addEventListener('input', showSearch);
  search.addEventListener('blur', closeSearch);
  search.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') { closeSearch(); return; }
    if (results.hidden) showSearch();
    if (event.key === 'Enter') { openMatch(selected); return; }
    if (!matches.length) return;
    selectMatch((selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    results.children[selected]?.scrollIntoView({block: 'nearest'});
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!search.parentElement.contains(event.target)) closeSearch();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && visible() && !sidebar.classList.contains('open')) {
      event.preventDefault(); search.focus(); search.select(); showSearch();
    }
  });
  // Permission changes invalidate open suggestions without changing any original grant.
  new MutationObserver(() => { if (!results.hidden) showSearch(); }).observe(sidebar, {subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled']});
  new MutationObserver(() => { if (!visible()) closeSearch(); }).observe(workspace, {attributes: true, attributeFilter: ['hidden', 'class']});

  const close = document.createElement('button');
  close.type = 'button'; close.className = 'nav-close'; close.textContent = '×';
  close.setAttribute('aria-label', 'Close navigation');
  sidebar.prepend(close);
  const mobile = matchMedia('(max-width: 920px)');
  const main = workspace.querySelector('.main');
  let drawerOpen = false, returnFocus;
  function closeDrawer() {
    sidebar.classList.remove('open');
    overlay?.classList.remove('show');
    menu?.setAttribute('aria-expanded', 'false');
  }
  close.addEventListener('click', closeDrawer);
  function syncDrawer() {
    const open = mobile.matches && visible() && sidebar.classList.contains('open');
    sidebar.inert = mobile.matches && !open;
    if (main) main.inert = open;
    document.body.classList.toggle('user-menu-open', open);
    if (open && !drawerOpen) { returnFocus = document.activeElement; close.focus(); closeSearch(); }
    if (!open && drawerOpen && sidebar.contains(document.activeElement)) {
      const target = returnFocus?.isConnected && !returnFocus.closest('[hidden],.hidden') ? returnFocus : menu;
      if (visible()) target?.focus();
    }
    drawerOpen = open;
  }
  new MutationObserver(syncDrawer).observe(sidebar, {attributes: true, attributeFilter: ['class']});
  new MutationObserver(syncDrawer).observe(workspace, {attributes: true, attributeFilter: ['hidden', 'class']});
  mobile.addEventListener('change', () => { if (!mobile.matches) closeDrawer(); syncDrawer(); });
  document.addEventListener('keydown', event => {
    if (!drawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...sidebar.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length && !node.hidden);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  syncDrawer();

  const title = document.getElementById('page-title');
  const location = document.getElementById('workspaceLocation');
  if (title && location) {
    const syncTitle = () => { location.textContent = title.textContent || 'Overview'; };
    new MutationObserver(syncTitle).observe(title, {childList: true, characterData: true, subtree: true});
    syncTitle();
  }
})();

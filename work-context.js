/** Shared role/mode policy. Mode never grants account permissions. */
(function (root) {
  const administrators = new Set(['owner', 'admin', 'developer']);
  const modes = {
    staff: ['floor','orders','reservations','inventory','inventory_read','finance','finance_read','loyalty'],
    bartender: ['floor','orders','reservations','inventory','inventory_read','bar_tasks'],
    hookah_master: ['floor','orders','reservations','inventory','inventory_read','hookah_tasks']
  };
  const routes = {
    '/': ['floor'], '/orders': ['orders'], '/clients': ['orders'],
    '/reservations': ['reservations'], '/inventory': ['inventory','inventory_read'],
    '/finance': ['finance','finance_read'], '/finance/report': ['finance','finance_read']
  };
  function resolve(account, requestedMode, permissions) {
    const canReturn = administrators.has(account.role);
    const nativeMode = ['bartender','senior_bartender'].includes(account.role) ? 'bartender'
      : ['hookah_master','senior_hookah_master'].includes(account.role) ? 'hookah_master' : 'staff';
    if (requestedMode && !Object.hasOwn(modes, requestedMode) && requestedMode !== 'admin') throw new Error('invalid_work_mode');
    if (!canReturn && requestedMode && requestedMode !== nativeMode) throw new Error('work_mode_forbidden');
    const mode = canReturn ? (requestedMode || 'admin') : nativeMode;
    const granted = [...new Set(permissions || [])];
    return { mode, canReturn, permissions: mode === 'admin' ? granted : granted.filter(p => modes[mode].includes(p)) };
  }
  function canVisit(context, pathname, hash = '') {
    if (context.mode === 'admin') return true; // Administrative routes retain their existing permission guards.
    if (pathname === '/admin' && hash === '#loyalty') return context.permissions.includes('loyalty');
    return Boolean(routes[pathname]?.some(p => context.permissions.includes(p)));
  }
  function route(context, path) {
    const url = new URL(path, 'http://crm.local');
    if (url.origin !== 'http://crm.local') throw new Error('external_work_route');
    if (!canVisit(context, url.pathname, url.hash)) throw new Error('work_route_forbidden');
    if (context.mode !== 'admin') url.searchParams.set('mode', context.mode);
    return url.pathname + url.search + url.hash;
  }
  const policy = { resolve, canVisit, route };
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  else root.CrmWorkContext = policy;
})(typeof window === 'undefined' ? globalThis : window);

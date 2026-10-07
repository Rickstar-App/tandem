// Tiny history router for the five routes in BRIEF §8. No dependency needed for this many.
export type Route =
  | { name: 'home' }
  | { name: 'table'; id: string }
  | { name: 'replay'; id: string }
  | { name: 'watch'; id: string }
  | { name: 'rules' }
  | { name: 'notfound'; path: string };

export function parse(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'home' };
  if (p === '/rules') return { name: 'rules' };
  const m = /^\/(t|g|watch)\/([0-9a-hjkmnp-tv-z]{8})$/.exec(p);
  if (m) return m[1] === 't' ? { name: 'table', id: m[2]! }
    : m[1] === 'g' ? { name: 'replay', id: m[2]! }
    : { name: 'watch', id: m[2]! };
  return { name: 'notfound', path: p };
}

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState({}, '', to); else history.pushState({}, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
}

/** Intercept same-origin left-clicks so internal links do not reload the app. */
export function linkHandler(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as HTMLElement | null)?.closest?.('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || !href.startsWith('/') || a.hasAttribute('download') || a.target === '_blank') return;
  e.preventDefault();
  navigate(href);
}

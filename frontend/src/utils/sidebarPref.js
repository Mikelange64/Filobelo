// "Start with sidebar collapsed" (Settings > Appearance). When on, the sidebar
// is collapsed every time the app loads; toggling it during a session doesn't
// change the setting. When off, the sidebar keeps remembering its last state.
// Plain localStorage, wrapped: it can throw in private windows.
const KEY = 'filobelo.sidebar.startCollapsed'

export function getStartCollapsed() {
  try { return localStorage.getItem(KEY) === 'true' } catch { return false }
}

export function setStartCollapsed(on) {
  try { localStorage.setItem(KEY, String(on)) } catch { /* ignore */ }
}

// The app is drawn under CSS zoom (see --ui-zoom in styles/global.css).
// Mouse coordinates and getBoundingClientRect() are in on-screen pixels, but
// CSS lengths set from code (style.top, style.width...) get multiplied by the
// zoom again. Divide screen pixels by getUiZoom() before using them as CSS.
export function getUiZoom() {
  if (typeof document === 'undefined') return 1
  const z = parseFloat(getComputedStyle(document.body).zoom)
  return Number.isFinite(z) && z > 0 ? z : 1
}

import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'filobelo-theme'
const VALID_THEMES = ['light', 'dark', 'midnight']
const ThemeContext = createContext(null)

// Interface size. 'default' draws the app at 90% (like browser zoom at 90%),
// 'large' at 100%. Applied as --ui-zoom on <html>; see styles/global.css.
const SCALE_KEY = 'filobelo-ui-scale'
const UI_SCALES = { default: 0.9, large: 1 }

function getInitialScale() {
  try {
    const stored = localStorage.getItem(SCALE_KEY)
    if (stored in UI_SCALES) return stored
  } catch { /* storage blocked: use the default */ }
  return 'default'
}

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (VALID_THEMES.includes(stored)) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme)
  const [scale, setScaleState] = useState(getInitialScale)

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-zoom', String(UI_SCALES[scale]))
    try { localStorage.setItem(SCALE_KEY, scale) } catch { /* ignore */ }
  }, [scale])

  function setScale(next) {
    if (next in UI_SCALES) setScaleState(next)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  function setTheme(next) {
    if (VALID_THEMES.includes(next)) setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, scale, setScale }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}

import { createContext, useContext, useEffect, type ReactNode } from 'react'

export type ThemeId = 'hub' | 'liminal' | 'screwai' | 'nodaw'

export interface ThemeInfo {
  label: string
  accent: string
  gradient: string
}

export const THEME_MAP: Record<ThemeId, ThemeInfo> = {
  hub: { label: 'MyAiPlug', accent: '#58a6ff', gradient: 'from-[#8a5cff] to-[#58a6ff]' },
  liminal: { label: 'Liminal', accent: '#00f0ff', gradient: 'from-[#00f0ff] to-[#0066ff]' },
  screwai: { label: 'ScrewAI', accent: '#a855f7', gradient: 'from-[#a855f7] to-[#4a0080]' },
  nodaw: { label: 'NoDAW', accent: '#d4af37', gradient: 'from-[#d4af37] to-[#06b6d4]' },
}

interface ThemeCtx {
  theme: ThemeId
  info: ThemeInfo
  setTheme: (t: ThemeId) => void
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'hub',
  info: THEME_MAP.hub,
  setTheme: () => {},
})

export function ThemeProvider({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.setProperty('--brand-accent', THEME_MAP[theme].accent)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, info: THEME_MAP[theme], setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

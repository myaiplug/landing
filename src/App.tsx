import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ThemeProvider, type ThemeId } from './themes/ThemeContext'
import Header from './components/shared/Header'
import Footer from './components/Footer'

function pathToTheme(path: string): ThemeId {
  if (path.startsWith('/liminal')) return 'liminal'
  if (path.startsWith('/screwai')) return 'screwai'
  if (path.startsWith('/nodaw')) return 'nodaw'
  return 'hub'
}

export default function App() {
  const location = useLocation()
  const [theme, setTheme] = useState<ThemeId>(() => pathToTheme(location.pathname))

  useEffect(() => {
    setTheme(pathToTheme(location.pathname))
  }, [location.pathname])

  return (
    <ThemeProvider theme={theme}>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-brand-bg)', color: 'var(--color-brand-fg)' }}>
        <Header />
        <main className="flex-1 pt-14">
          <Outlet />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}

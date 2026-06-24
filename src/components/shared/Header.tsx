import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme, type ThemeId } from '../../themes/ThemeContext'

const NAV_LINKS: { label: string; href: string; theme?: ThemeId }[] = [
  { label: 'Marketplace', href: '#marketplace' },
  { label: 'Free Tools', href: '#tools' },
  { label: 'Services', href: '#services' },
  { label: 'Features', href: '#features' },
]

const BRAND_LINKS: { theme: ThemeId; label: string; path: string }[] = [
  { theme: 'liminal', label: 'Liminal', path: '/liminal' },
  { theme: 'screwai', label: 'ScrewAI', path: '/screwai' },
  { theme: 'nodaw', label: 'NoDAW', path: '/nodaw' },
]

export default function Header() {
  const { theme, info } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const isHub = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      ref={headerRef}
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[rgba(13,17,23,0.95)] backdrop-blur-md border-b border-[rgba(139,148,158,0.12)] shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}
      style={{
        backgroundColor: scrolled ? 'var(--color-brand-card)' : 'transparent',
        borderColor: scrolled ? 'var(--color-brand-border)' : 'transparent',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 no-underline" aria-label="MyAiPlug Home">
            <div
              className="w-7 h-7 rounded-full bg-gradient-to-br flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${info.accent}, ${theme === 'hub' ? '#58a6ff' : '#ffffff44'})` }}
            />
            <motion.span
              key={theme}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-extrabold text-lg tracking-tight"
              style={{ color: info.accent }}
            >
              {isHub ? 'MyAiPlug' : info.label}
            </motion.span>
          </Link>

          {!isHub && (
            <Link
              to="/"
              className="hidden sm:inline-flex text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors no-underline"
            >
              ← Back to Hub
            </Link>
          )}
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {isHub ? (
            NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3.5 py-1.5 text-sm font-medium text-[#8b949e] hover:text-[#c9d1d9] rounded-md hover:bg-white/5 transition-colors duration-150 no-underline"
              >
                {link.label}
              </a>
            ))
          ) : (
            BRAND_LINKS.filter((b) => b.path !== location.pathname).map((brand) => (
              <Link
                key={brand.path}
                to={brand.path}
                className="px-3.5 py-1.5 text-sm font-medium rounded-md hover:bg-white/5 transition-colors duration-150 no-underline"
                style={{ color: THEME_ACCENT[brand.theme] }}
              >
                {brand.label}
              </Link>
            ))
          )}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {isHub && (
            <Link to="#marketplace" className="btn-primary text-sm py-2 no-underline">
              Browse Marketplace
            </Link>
          )}
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          className="md:hidden p-2 rounded-lg text-[#8b949e] hover:text-[#c9d1d9] hover:bg-white/5 transition-colors"
        >
          <div className="w-5 space-y-1.5">
            <motion.span
              animate={menuOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
              className="block h-0.5 bg-current rounded-full"
            />
            <motion.span
              animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
              className="block h-0.5 bg-current rounded-full"
            />
            <motion.span
              animate={menuOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
              className="block h-0.5 bg-current rounded-full"
            />
          </div>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden fixed top-14 left-0 right-0 border-t"
              style={{
                backgroundColor: 'var(--color-brand-bg)',
                borderColor: 'var(--color-brand-border)',
              }}
            >
              <div className="px-4 py-3 flex flex-col gap-1">
                {(isHub ? NAV_LINKS : BRAND_LINKS.filter((b) => b.path !== location.pathname)).map((link) => {
                  const href = 'href' in link ? link.href : link.path
                  return 'href' in link ? (
                    <a
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="px-3 py-2 text-sm font-medium text-[#8b949e] hover:text-[#c9d1d9] rounded-md hover:bg-white/5 transition-colors no-underline"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={href}
                      to={href}
                      onClick={() => setMenuOpen(false)}
                      className="px-3 py-2 text-sm font-medium text-[#8b949e] hover:text-[#c9d1d9] rounded-md hover:bg-white/5 transition-colors no-underline"
                    >
                      {link.label}
                    </Link>
                  )
                })}
                {isHub && (
                  <Link to="#marketplace" className="btn-primary text-sm mt-2 text-center no-underline" onClick={() => setMenuOpen(false)}>
                    Browse Marketplace
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  )
}

const THEME_ACCENT: Record<string, string> = {
  liminal: '#00f0ff',
  screwai: '#a855f7',
  nodaw: '#d4af37',
}

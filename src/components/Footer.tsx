import { motion } from 'framer-motion'

const LINKS = [
  { label: 'Marketplace', href: '#marketplace' },
  { label: 'Free Tools', href: '#tools' },
  { label: 'Services', href: '#services' },
  { label: 'Features', href: '#features' },
]

export default function Footer() {
  return (
    <footer className="border-t border-[rgba(139,148,158,0.12)] py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <motion.a
          href="#"
          className="flex items-center gap-2.5 no-underline"
          whileHover={{ opacity: 0.8 }}
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#8a5cff] to-[#58a6ff]" />
          <span className="font-extrabold text-sm text-[#e6edf3]">MyAiPlug</span>
        </motion.a>

        <nav className="flex items-center gap-4">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors no-underline"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="text-xs text-[#8b949e]">
          &copy; {new Date().getFullYear()} MyAiPlug. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

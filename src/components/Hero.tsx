import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue } from 'framer-motion'
import { Sparkles, Disc3, Monitor, ArrowRight } from 'lucide-react'

const BRANDS = [
  {
    id: 'liminal',
    name: 'Liminal',
    tagline: 'See inside sound.',
    desc: 'AI stem separation that reveals what\'s hidden in your tracks.',
    color: '#00f0ff',
    bgGlow: 'rgba(0,240,255,0.04)',
    borderGlow: 'rgba(0,240,255,0.15)',
    path: '/liminal',
    icon: Sparkles,
  },
  {
    id: 'screwai',
    name: 'ScrewAI',
    tagline: 'The slow melts your mind.',
    desc: 'Chopped, screwed, and stretched — infinite variations from one track.',
    color: '#a855f7',
    bgGlow: 'rgba(168,85,247,0.04)',
    borderGlow: 'rgba(168,85,247,0.15)',
    path: '/screwai',
    icon: Disc3,
  },
  {
    id: 'nodaw',
    name: 'NoDAW',
    tagline: 'Your Audio OS.',
    desc: 'Convert, trim, process, and export — no DAW required.',
    color: '#d4af37',
    bgGlow: 'rgba(212,175,55,0.04)',
    borderGlow: 'rgba(212,175,55,0.15)',
    path: '/nodaw',
    icon: Monitor,
  },
]

const ORBS = [
  { size: 400, x: '10%', y: '15%', color: 'rgba(0,240,255,0.04)', delay: 0 },
  { size: 300, x: '75%', y: '10%', color: 'rgba(168,85,247,0.05)', delay: 2 },
  { size: 350, x: '50%', y: '60%', color: 'rgba(212,175,55,0.03)', delay: 4 },
]

export default function Hero() {
  const navigate = useNavigate()
  const mouseX = useMotionValue(0.5)
  const mouseY = useMotionValue(0.5)


  return (
    <section
      className="relative min-h-screen flex items-center pt-14 overflow-hidden"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        mouseX.set((e.clientX - rect.left) / rect.width)
        mouseY.set((e.clientY - rect.top) / rect.height)
      }}
    >
      {/* Ambient orbs follow cursor */}
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
            scale: [1, 1.05, 0.95, 1],
            opacity: [0.3, 0.5, 0.2, 0.3],
          }}
          transition={{
            duration: 12 + i * 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: orb.delay,
          }}
        />
      ))}

      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mb-16"
        >
          <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#8b949e]">
            MyAiPlug Ecosystem
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#e6edf3] leading-[1.08] tracking-tight mt-4">
            Audio tools that feel like{' '}
            <span className="bg-gradient-to-r from-[#58a6ff] via-[#a855f7] to-[#d4af37] bg-clip-text text-transparent">
              instruments.
            </span>
          </h1>
          <p className="text-lg text-[#8b949e] mt-4 max-w-xl leading-relaxed">
            Three tools. One philosophy. No subscriptions, no cloud dependency — just software that respects you.
          </p>
        </motion.div>

        {/* Brand cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5"
        >
          {BRANDS.map((brand, i) => {
            const Icon = brand.icon
            return (
              <motion.button
                key={brand.id}
                onClick={() => navigate(brand.path)}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.12 }}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative group text-left rounded-2xl p-6 lg:p-8 border transition-all duration-300 cursor-pointer w-full"
                style={{
                  background: `linear-gradient(135deg, ${brand.bgGlow}, transparent 80%)`,
                  borderColor: 'var(--color-brand-border)',
                }}
              >
                {/* Hover gradient overlay */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at 30% 20%, ${brand.borderGlow} 0%, transparent 60%)`,
                  }}
                />

                <div className="relative">
                  <div
                    className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center mb-4 lg:mb-5 transition-all duration-300 group-hover:scale-110"
                    style={{ background: `${brand.color}12` }}
                  >
                    <Icon className="w-5 h-5 lg:w-6 lg:h-6" style={{ color: brand.color }} />
                  </div>

                  <div className="text-xs font-semibold tracking-[0.15em] uppercase mb-1.5" style={{ color: brand.color }}>
                    {brand.name}
                  </div>

                  <h3 className="text-lg lg:text-xl font-extrabold text-[#e6edf3] leading-tight mb-2">
                    {brand.tagline}
                  </h3>

                  <p className="text-sm text-[#8b949e] leading-relaxed mb-4">
                    {brand.desc}
                  </p>

                  <div
                    className="inline-flex items-center gap-1.5 text-xs font-semibold transition-all duration-300 group-hover:gap-2.5"
                    style={{ color: brand.color }}
                  >
                    Explore
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </motion.button>
            )
          })}
        </motion.div>

        {/* Quick-access free tools strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-3 text-xs text-[#8b949e]"
        >
          <span className="text-[10px] font-semibold tracking-widest uppercase mr-1">Free tools:</span>
          {['ConvertIT', 'TrimIT', 'FxIT', 'TestIT'].map((tool) => (
            <button
              key={tool}
              onClick={() => navigate(`/${tool.toLowerCase()}`)}
              className="px-3 py-1.5 rounded-lg border transition-all duration-200 hover:text-white"
              style={{
                borderColor: 'var(--color-brand-border)',
                background: 'var(--color-brand-card)',
              }}
            >
              {tool}
            </button>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-px h-10 bg-gradient-to-b from-[#8b949e] to-transparent"
          />
        </motion.div>
      </div>
    </section>
  )
}

import { motion } from 'framer-motion'
import { Zap, Layers, Radio } from 'lucide-react'

const TILES = [
  {
    icon: Zap,
    title: 'Generate',
    desc: 'Prompt packs · Hook vaults · Beat tools',
    href: '#marketplace',
    color: '#58a6ff',
  },
  {
    icon: Layers,
    title: 'Flip & Process',
    desc: 'StemSplit · Half-time · 432Hz · Tags',
    href: '#tools',
    color: '#8a5cff',
  },
  {
    icon: Radio,
    title: 'Finish & Release',
    desc: 'Master chains · Cover art · Metadata',
    href: '#marketplace',
    color: '#3fb950',
  },
]

const FLOAT_ORBS = [
  { size: 320, x: '15%', y: '20%', color: 'rgba(88,166,255,0.06)', delay: 0 },
  { size: 240, x: '75%', y: '10%', color: 'rgba(138,92,255,0.08)', delay: 1.5 },
  { size: 200, x: '60%', y: '60%', color: 'rgba(63,185,80,0.05)', delay: 3 },
  { size: 160, x: '5%', y: '65%', color: 'rgba(88,166,255,0.04)', delay: 2 },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const ease = [0.25, 0.46, 0.45, 0.94] as const

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
}

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-14 overflow-hidden">
      {FLOAT_ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 8,
            delay: orb.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-20 lg:py-28">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-3xl"
        >
          <motion.div variants={itemVariants}>
            <span className="badge mb-5 inline-flex">All‑In‑One AI Audio Creation Hub</span>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-[#e6edf3] leading-[1.05] tracking-tight mt-4"
          >
            Plug In.{' '}
            <span className="bg-gradient-to-r from-[#58a6ff] to-[#8a5cff] bg-clip-text text-transparent">
              Create.
            </span>{' '}
            Release.
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg md:text-xl text-[#8b949e] mt-6 max-w-2xl leading-relaxed"
          >
            From prompt recipes to studio-ready masters — generate, flip, process, and release. 
            Free tools, premium packs, and done-for-you services for independent creators.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex flex-wrap gap-3 mt-8"
          >
            <a href="#marketplace" className="btn-primary inline-flex items-center gap-2">
              Browse Marketplace
            </a>
            <a href="#tools" className="btn-ghost inline-flex items-center gap-2">
              Try Free Tools
            </a>
          </motion.div>

          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-12"
          >
            {TILES.map((tile) => {
              const Icon = tile.icon
              return (
                <motion.a
                  key={tile.title}
                  href={tile.href}
                  variants={itemVariants}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="card-glass p-4 rounded-xl no-underline group cursor-pointer"
                  style={{ borderColor: `${tile.color}20` }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: `${tile.color}15` }}
                  >
                    <Icon size={16} style={{ color: tile.color }} />
                  </div>
                  <div className="font-bold text-[#e6edf3] text-sm group-hover:text-white transition-colors">
                    {tile.title}
                  </div>
                  <div className="text-xs text-[#8b949e] mt-1 leading-relaxed">{tile.desc}</div>
                </motion.a>
              )
            })}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2"
        >
          <span className="text-xs text-[#8b949e]">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-px h-8 bg-gradient-to-b from-[#8b949e] to-transparent"
          />
        </motion.div>
      </div>
    </section>
  )
}

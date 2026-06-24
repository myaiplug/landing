import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Repeat2, Wand2, Scissors, AudioWaveform, Image, Music4 } from 'lucide-react'

interface FreeTool {
  id: string
  icon: React.ElementType
  name: string
  desc: string
  badge: string
  href: string
  iconColor: string
  glowColor: string
}

const FREE_TOOLS: FreeTool[] = [
  {
    id: 'convertit',
    icon: Repeat2,
    name: 'ConvertIT',
    desc: 'Convert audio between WAV, MP3, FLAC, OGG and more — all in the browser.',
    badge: 'Free',
    href: '#tools',
    iconColor: '#58a6ff',
    glowColor: 'rgba(88,166,255,0.12)',
  },
  {
    id: 'fxit',
    icon: Wand2,
    name: 'FXit',
    desc: 'Apply reverb, compression, EQ, and saturation chains without a DAW.',
    badge: 'Free',
    href: '#tools',
    iconColor: '#8a5cff',
    glowColor: 'rgba(138,92,255,0.12)',
  },
  {
    id: 'trimIt',
    icon: Scissors,
    name: 'TrimIT',
    desc: 'Trim, loop, and fade audio clips with frame-accurate precision.',
    badge: 'Free',
    href: '#tools',
    iconColor: '#3fb950',
    glowColor: 'rgba(63,185,80,0.12)',
  },
  {
    id: 'testit',
    icon: AudioWaveform,
    name: 'TestIT',
    desc: 'Analyze your audio — frequency response, dynamics, and loudness (LUFS).',
    badge: 'Free',
    href: '#tools',
    iconColor: '#f0a732',
    glowColor: 'rgba(240,167,50,0.12)',
  },
  {
    id: 'iconit',
    icon: Image,
    name: 'IconIT',
    desc: 'Generate release-ready cover art icons from text descriptions instantly.',
    badge: 'Beta',
    href: '#tools',
    iconColor: '#ff7eb3',
    glowColor: 'rgba(255,126,179,0.12)',
  },
  {
    id: 'retune432',
    icon: Music4,
    name: 'reTUNE432',
    desc: 'Re-pitch any audio file from 440Hz to 432Hz — drag, drop, download.',
    badge: 'Beta',
    href: '#tools',
    iconColor: '#56d4e0',
    glowColor: 'rgba(86,212,224,0.12)',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
}

const ease = [0.25, 0.46, 0.45, 0.94] as const

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
}

export default function FreeToolsSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section id="tools" ref={sectionRef} className="py-20 lg:py-28 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[rgba(88,166,255,0.02)] to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <span className="badge mb-4 inline-block">100% Free</span>
          <h2 className="section-title">Free Tools</h2>
          <p className="section-sub">
            Browser-based audio tools that run locally — no uploads, no limits, no subscription required.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {FREE_TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <motion.div
                key={tool.id}
                variants={cardVariants}
                whileHover={{ y: -6 }}
                className="card-glass p-6 rounded-xl group relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 20% 20%, ${tool.glowColor} 0%, transparent 60%)` }}
                />

                <div className="relative">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: tool.glowColor }}
                  >
                    <Icon size={22} style={{ color: tool.iconColor }} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-extrabold text-[#e6edf3] text-base">{tool.name}</h3>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${tool.iconColor}18`,
                        color: tool.iconColor,
                        border: `1px solid ${tool.iconColor}30`,
                      }}
                    >
                      {tool.badge}
                    </span>
                  </div>

                  <p className="text-sm text-[#8b949e] leading-relaxed mb-5">{tool.desc}</p>

                  <motion.a
                    href={tool.href}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 text-sm font-semibold no-underline transition-colors duration-150"
                    style={{ color: tool.iconColor }}
                  >
                    Launch Tool
                    <motion.span
                      animate={{ x: [0, 3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      →
                    </motion.span>
                  </motion.a>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

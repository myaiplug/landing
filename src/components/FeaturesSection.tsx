import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { HardDrive, CreditCard, Infinity, Monitor } from 'lucide-react'

interface Feature {
  icon: React.ElementType
  title: string
  desc: string
  color: string
  stat: string
  statLabel: string
}

const FEATURES: Feature[] = [
  {
    icon: HardDrive,
    title: '100% Local Processing',
    desc: 'Your audio never leaves your machine. All processing happens in the browser or on your local machine — zero cloud uploads.',
    color: '#3fb950',
    stat: '0',
    statLabel: 'bytes uploaded',
  },
  {
    icon: CreditCard,
    title: 'One-Time Payment',
    desc: 'Buy once, use forever. No subscription traps, no recurring fees. Packs, tools, and templates are yours permanently.',
    color: '#58a6ff',
    stat: '∞',
    statLabel: 'lifetime use',
  },
  {
    icon: Infinity,
    title: 'Unlimited Use',
    desc: "Run it as many times as you need. No usage limits, no credit counters, no throttling on the tools you've purchased.",
    color: '#8a5cff',
    stat: '∞',
    statLabel: 'no limits',
  },
  {
    icon: Monitor,
    title: 'Cross-Platform',
    desc: 'Works on Windows, macOS, and Linux. Browser tools run anywhere with a modern browser — no installs required.',
    color: '#f0a732',
    stat: '3+',
    statLabel: 'platforms',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const ease = [0.25, 0.46, 0.45, 0.94] as const

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
}

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section id="features" ref={sectionRef} className="py-20 lg:py-28 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(88,166,255,0.08) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <span className="badge mb-4 inline-block">Why MyAiPlug</span>
          <h2 className="section-title mx-auto">Built Different</h2>
          <p className="section-sub mx-auto text-center">
            Tools made for independent creators who value ownership, privacy, and simplicity over corporate SaaS.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                whileHover={{ y: -6 }}
                className="card-glass p-6 rounded-xl text-center group relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${feature.color}08 0%, transparent 60%)`,
                  }}
                />

                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    style={{ background: `${feature.color}15` }}
                  >
                    <Icon size={22} style={{ color: feature.color }} />
                  </div>

                  <div className="font-extrabold text-3xl mb-0.5" style={{ color: feature.color }}>
                    {feature.stat}
                  </div>
                  <div className="text-xs text-[#8b949e] mb-3">{feature.statLabel}</div>

                  <h3 className="font-bold text-[#e6edf3] text-sm mb-2">{feature.title}</h3>
                  <p className="text-xs text-[#8b949e] leading-relaxed">{feature.desc}</p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

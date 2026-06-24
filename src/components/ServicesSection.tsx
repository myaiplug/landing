import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Layers, Clock, Star, ExternalLink } from 'lucide-react'

interface Service {
  id: string
  icon: React.ElementType
  name: string
  tagline: string
  price: string
  priceLabel: string
  bullets: string[]
  cta: string
  href: string
  accentColor: string
  popular?: boolean
}

const SERVICES: Service[] = [
  {
    id: 'stem-split',
    icon: Layers,
    name: 'AI Stem Splitting Service',
    tagline: 'Vocals, drums, bass, and more — separated with AI precision.',
    price: '$5',
    priceLabel: 'per track',
    bullets: [
      '2, 4, or 5-stem separation',
      'Demucs / MDX-Net models',
      'High-quality WAV delivery',
      '24–48h turnaround',
    ],
    cta: 'Order on Fiverr',
    href: 'https://www.fiverr.com',
    accentColor: '#58a6ff',
    popular: true,
  },
  {
    id: 'screw-halftime',
    icon: Clock,
    name: 'Screw / Half-Time Processing',
    tagline: 'That slow, syrupy, screwed sound — done right, every time.',
    price: '$5',
    priceLabel: 'per track',
    bullets: [
      'Half-time & slowed-down processing',
      'Tape wobble & pitch adjustments',
      'Studio-quality WAV output',
      '24h turnaround guaranteed',
    ],
    cta: 'Order on Fiverr',
    href: 'https://www.fiverr.com',
    accentColor: '#8a5cff',
  },
]

export default function ServicesSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section id="services" ref={sectionRef} className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <span className="badge mb-4 inline-block">Done For You</span>
          <h2 className="section-title">Services</h2>
          <p className="section-sub">
            Don't have the tools or time? Send us your audio — we handle the rest and deliver studio-ready results.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {SERVICES.map((service, i) => {
            const Icon = service.icon
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 28 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                whileHover={{ y: -5 }}
                className="card-glass p-6 rounded-xl relative overflow-hidden group"
                style={{ borderColor: `${service.accentColor}20` }}
              >
                {service.popular && (
                  <div className="absolute top-4 right-4">
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/25">
                      <Star size={9} fill="currentColor" />
                      Popular
                    </span>
                  </div>
                )}

                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 10% 90%, ${service.accentColor}08 0%, transparent 60%)`,
                  }}
                />

                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${service.accentColor}15` }}
                  >
                    <Icon size={24} style={{ color: service.accentColor }} />
                  </div>

                  <h3 className="font-extrabold text-[#e6edf3] text-lg mb-1">{service.name}</h3>
                  <p className="text-sm text-[#8b949e] mb-5 leading-relaxed">{service.tagline}</p>

                  <ul className="space-y-2 mb-6">
                    {service.bullets.map((b, j) => (
                      <li key={j} className="flex items-center gap-2.5 text-sm text-[#8b949e]">
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: service.accentColor }} />
                        {b}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between">
                    <div>
                      <span
                        className="text-2xl font-extrabold"
                        style={{ color: service.accentColor }}
                      >
                        {service.price}
                      </span>
                      <span className="text-xs text-[#8b949e] ml-1">{service.priceLabel}</span>
                    </div>

                    <motion.a
                      href={service.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileTap={{ scale: 0.96 }}
                      className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-lg no-underline transition-all duration-150"
                      style={{
                        background: `${service.accentColor}18`,
                        color: service.accentColor,
                        border: `1px solid ${service.accentColor}30`,
                      }}
                    >
                      <ExternalLink size={13} />
                      {service.cta}
                    </motion.a>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

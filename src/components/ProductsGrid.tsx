import { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { ShoppingCart, ExternalLink, Tag } from 'lucide-react'

interface Product {
  id: string
  category: string
  title: string
  priceCents: number
  priceTag: string
  image: string
  tags: string[]
  formats: string[]
  bullets: string[]
  badge?: string
  delivery: string
  priceId?: string
  toolHref?: string
}

interface Category {
  id: string
  title: string
  tagline: string
}

interface Props {
  products: Product[]
  categories: Category[]
}

function priceFmt(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

const easeOutQuint = [0.25, 0.46, 0.45, 0.94] as const

const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: easeOutQuint } },
}

function ProductCard({ product }: { product: Product }) {
  const isWeb = product.delivery === 'web'
  const isFree = product.priceCents === 0

  return (
    <motion.article
      variants={cardVariants}
      whileHover={{ y: -5 }}
      className="card-glass flex flex-col overflow-hidden rounded-xl group"
    >
      <div className="relative overflow-hidden">
        <motion.img
          src={product.image}
          alt={product.title}
          loading="lazy"
          className="w-full h-[148px] object-cover"
          whileHover={{ scale: 1.04 }}
          transition={{ duration: 0.4 }}
        />
        {product.badge && (
          <span className="absolute top-2 right-2 badge text-[10px]">{product.badge}</span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[#e6edf3] text-sm leading-snug flex-1">{product.title}</h3>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-[#58a6ff] text-base">{priceFmt(product.priceCents)}</span>
          <span className="text-xs text-[#8b949e]">{product.priceTag}</span>
        </div>

        <ul className="text-xs text-[#8b949e] space-y-1 flex-1">
          {product.bullets.slice(0, 3).map((b, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-[#3fb950] mt-0.5 flex-shrink-0">•</span>
              {b}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-1 mt-1">
          {product.tags.map((tag) => (
            <span key={tag} className="tag flex items-center gap-1">
              <Tag size={9} />
              {tag}
            </span>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          {isWeb ? (
            <a
              href={product.toolHref || '#tools'}
              className="btn-primary text-xs py-2 px-3 flex-1 flex items-center justify-center gap-1.5 no-underline"
            >
              <ExternalLink size={12} />
              Open Tool
            </a>
          ) : isFree ? (
            <button className="btn-primary text-xs py-2 px-3 flex-1 flex items-center justify-center gap-1.5">
              <ShoppingCart size={12} />
              Get Free
            </button>
          ) : (
            <button className="btn-primary text-xs py-2 px-3 flex-1 flex items-center justify-center gap-1.5">
              <ShoppingCart size={12} />
              {product.delivery === 'subscription' ? 'Subscribe' : 'Buy Now'}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  )
}

export default function ProductsGrid({ products, categories }: Props) {
  const [activeFilter, setActiveFilter] = useState('all')
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-100px' })

  const allFilters = [{ id: 'all', title: 'All', tagline: '' }, ...categories]
  const filtered = activeFilter === 'all' ? products : products.filter((p) => p.category === activeFilter)
  const activeCategoryInfo = categories.find((c) => c.id === activeFilter)

  return (
    <section id="marketplace" ref={sectionRef} className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h2 className="section-title">Marketplace</h2>
          <p className="section-sub">
            {activeCategoryInfo?.tagline || 'Packs, tools, templates, credits, and memberships for every stage of your process.'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap gap-2 mb-8"
          role="group"
          aria-label="Filter products"
        >
          {allFilters.map((cat) => (
            <motion.button
              key={cat.id}
              onClick={() => setActiveFilter(cat.id)}
              whileTap={{ scale: 0.96 }}
              className={`text-sm font-medium px-4 py-2 rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#58a6ff]/30 ${
                activeFilter === cat.id
                  ? 'bg-[#58a6ff] text-[#0d1117] border-[#58a6ff] font-bold'
                  : 'bg-transparent border-[rgba(139,148,158,0.25)] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[rgba(88,166,255,0.4)]'
              }`}
            >
              {cat.title}
            </motion.button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-[#8b949e] py-12"
          >
            No products in this category yet.
          </motion.p>
        )}
      </div>
    </section>
  )
}

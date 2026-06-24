import { motion } from 'framer-motion'

export default function EmailCapture() {
  return (
    <section className="py-20 lg:py-28 border-t border-[rgba(139,148,158,0.12)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="section-title">Stay in the Loop</h2>
          <p className="section-sub mx-auto">
            New tools, packs, and updates. No spam. Unsubscribe anytime.
          </p>
          <form className="mt-8 max-w-md mx-auto flex gap-3" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="you@example.com"
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#161b22] border border-[rgba(139,148,158,0.2)] text-[#c9d1d9] text-sm focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30"
            />
            <button type="submit" className="btn-primary text-sm whitespace-nowrap">
              Subscribe
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  )
}

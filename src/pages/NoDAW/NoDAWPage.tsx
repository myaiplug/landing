import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Canvas } from '@react-three/fiber'
import { Upload, ArrowLeft, ExternalLink, Music, Scissors, Wand2, GitCompare } from 'lucide-react'
import ToolOrbit from '../../three/ToolOrbit'
import ParticleField from '../../three/ParticleField'

const TOOLS = [
  { label: 'ConvertIT', color: '#d4af37', icon: '🎵', route: '/convertit', iconComp: Music },
  { label: 'TrimIT', color: '#22d3ee', icon: '✂️', route: '/timit', iconComp: Scissors },
  { label: 'FxIT', color: '#f43f5e', icon: '✨', route: '/fxit', iconComp: Wand2 },
  { label: 'TestIT', color: '#8b5cf6', icon: '🔊', route: '/testit', iconComp: GitCompare },
]

export default function NoDAWPage() {
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) { setFileName(file.name); setActive(true) }
  }, [])

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 7], fov: 45 }}>
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.2} />
          <pointLight position={[0, 3, 5]} intensity={0.4} color="#d4af37" />
          <ParticleField count={400} color="#d4af37" speed={0.02} />
          <ToolOrbit tools={TOOLS} active={active} />
        </Canvas>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-[#8b949e] hover:text-white transition-colors no-underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: '#d4af37' }}>
            NoDAW
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl sm:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
              Your{' '}
              <span className="bg-gradient-to-r from-[#d4af37] to-[#06b6d4] bg-clip-text text-transparent">
                Audio OS.
              </span>
            </h1>
            <p className="text-lg sm:text-xl mt-4 max-w-lg mx-auto" style={{ color: '#8b949e' }}>
              Drag a file. Tools activate around it. Convert, trim, process, and export — no DAW required.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-10"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) { setFileName(e.target.files[0].name); setActive(true) }
              }}
            />
            <button
              onClick={() => !active && fileInputRef.current?.click()}
              className="group relative px-10 py-6 rounded-2xl transition-all duration-300"
              style={{
                background: active ? 'rgba(212,175,55,0.08)' : 'rgba(212,175,55,0.03)',
                border: `1px solid ${active ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.12)'}`,
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-8 h-8" style={{ color: active ? '#d4af37' : '#3f3f46' }} />
                <span className="text-sm font-semibold text-white">
                  {fileName ? `${fileName} — tools activated` : 'Drop audio or click to start'}
                </span>
              </div>
            </button>
          </motion.div>

          {active && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {TOOLS.map((tool) => {
                const Icon = tool.iconComp
                return (
                  <motion.a
                    key={tool.label}
                    href={tool.route}
                    onClick={(e) => { e.preventDefault(); navigate(tool.route) }}
                    whileHover={{ y: -4, scale: 1.05 }}
                    className="flex flex-col items-center gap-2 px-5 py-4 rounded-xl no-underline transition-all"
                    style={{ background: `${tool.color}08`, border: `1px solid ${tool.color}20` }}
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${tool.color}15` }}>
                      <Icon className="w-5 h-5" style={{ color: tool.color }} />
                    </div>
                    <span className="text-sm font-bold text-white">{tool.label}</span>
                    <ExternalLink className="w-3 h-3" style={{ color: tool.color }} />
                  </motion.a>
                )
              })}
            </motion.div>
          )}
        </div>

        {!active && (
          <div className="px-6 py-4 flex justify-center gap-4 text-xs" style={{ color: '#8b949e' }}>
            <span>Convert</span>
            <span style={{ color: '#d4af37' }}>●</span>
            <span>Trim</span>
            <span style={{ color: '#22d3ee' }}>●</span>
            <span>FX</span>
            <span style={{ color: '#f43f5e' }}>●</span>
            <span>Compare</span>
            <span style={{ color: '#8b5cf6' }}>●</span>
          </div>
        )}
      </div>
    </div>
  )
}

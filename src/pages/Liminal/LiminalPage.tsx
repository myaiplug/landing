import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Canvas } from '@react-three/fiber'
import { Upload, ArrowLeft } from 'lucide-react'
import ParticleField from '../../three/ParticleField'
import Waveform3D from '../../three/Waveform3D'
import StemStream from '../../three/StemStream'

const STEMS = [
  { label: 'Vocals', color: '#00f0ff', dir: { x: -1.2, y: 1.5 } },
  { label: 'Drums', color: '#ff6b35', dir: { x: 1.5, y: 1.2 } },
  { label: 'Bass', color: '#a855f7', dir: { x: -1, y: -1.5 } },
  { label: 'Other', color: '#22c55e', dir: { x: 1.2, y: -1 } },
]

export default function LiminalPage() {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const [exploded, setExploded] = useState(false)
  const [waveData, setWaveData] = useState<Float32Array | undefined>(undefined)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    loadAudioFile(file)
  }, [])

  const loadAudioFile = useCallback(async (file: File) => {
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuf = await ctx.decodeAudioData(buf)
      const channel = audioBuf.getChannelData(0)
      const samples = 128
      const block = Math.floor(channel.length / samples)
      const data = new Float32Array(samples)
      for (let i = 0; i < samples; i++) {
        let peak = 0
        for (let j = 0; j < block; j++) {
          const abs = Math.abs(channel[i * block + j])
          if (abs > peak) peak = abs
        }
        data[i] = peak
      }
      setWaveData(data)
      setTimeout(() => setExploded(true), 600)
    } catch {
      // silent fallback — waveform stays animated
    }
  }, [])

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
          <color attach="background" args={['#060d1a']} />
          <ambientLight intensity={0.3} />
          <pointLight position={[0, 3, 5]} intensity={0.8} color="#00f0ff" />
          <ParticleField count={600} color="#00f0ff" speed={0.03} />
          <group position={[0, 0.5, 0]}>
            <Waveform3D color="#00f0ff" hoverIntensity={hovered ? 1 : 0} waveData={waveData} />
            {exploded && STEMS.map((stem) => (
              <StemStream key={stem.label} color={stem.color} direction={stem.dir} exploded={exploded} />
            ))}
          </group>
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
          <span className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: '#00f0ff' }}>
            Liminal
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="text-5xl sm:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
              See inside{' '}
              <span className="bg-gradient-to-r from-[#00f0ff] to-[#0066ff] bg-clip-text text-transparent">
                sound.
              </span>
            </h1>
            <p className="text-lg sm:text-xl mt-4 max-w-lg mx-auto" style={{ color: '#8b949e' }}>
              Drop any track. Watch it reveal vocals, drums, bass, and more — each one flying apart in real time.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-10"
            onMouseEnter={() => !exploded && setHovered(true)}
            onMouseLeave={() => !exploded && setHovered(false)}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && loadAudioFile(e.target.files[0])}
            />
            <button
              onClick={() => !exploded && fileInputRef.current?.click()}
              className="group relative px-8 py-4 rounded-2xl transition-all duration-300"
              style={{
                background: exploded ? 'rgba(0,240,255,0.1)' : 'rgba(0,240,255,0.05)',
                border: `1px solid ${hovered ? 'rgba(0,240,255,0.5)' : 'rgba(0,240,255,0.15)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5" style={{ color: '#00f0ff' }} />
                <span className="text-sm font-semibold text-white">
                  {fileName ? `Analyzing: ${fileName}` : exploded ? 'Stems separated' : 'Drop audio or click to upload'}
                </span>
              </div>
            </button>
          </motion.div>

          {exploded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-8 flex flex-wrap gap-4 justify-center"
            >
              {STEMS.map((stem) => (
                <div key={stem.label} className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: `${stem.color}10`, border: `1px solid ${stem.color}30` }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: stem.color }} />
                  <span className="text-sm font-medium" style={{ color: stem.color }}>{stem.label}</span>
                </div>
              ))}
            </motion.div>
          )}

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            onClick={() => setExploded(false)}
            className="mt-8 text-xs text-[#8b949e] hover:text-white transition-colors"
          >
            {exploded ? 'Reset' : ''}
          </motion.button>
        </div>

        <div className="px-6 py-4 flex justify-center gap-6 text-xs" style={{ color: '#8b949e' }}>
          <span>Vocals</span>
          <span style={{ color: '#00f0ff' }}>●</span>
          <span>Drums</span>
          <span style={{ color: '#ff6b35' }}>●</span>
          <span>Bass</span>
          <span style={{ color: '#a855f7' }}>●</span>
          <span>Other</span>
          <span style={{ color: '#22c55e' }}>●</span>
        </div>
      </div>
    </div>
  )
}

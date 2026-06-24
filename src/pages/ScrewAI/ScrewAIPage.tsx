import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { ArrowLeft } from 'lucide-react'
import Waveform3D from '../../three/Waveform3D'
import SyrupParticles from '../../three/SyrupParticles'

export default function ScrewAIPage() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const [reachedThreshold, setReachedThreshold] = useState(false)
  const [waveScale, setWaveScale] = useState(1)

  const titleOpacity = useTransform(scrollYProgress, [0, 0.15, 0.3], [1, 1, 0.3])
  const variationsReveal = useTransform(scrollYProgress, [0.4, 0.55], [0, 1])

  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      if (v > 0.5 && !reachedThreshold) setReachedThreshold(true)
      setWaveScale(1 + v * 3)
    })
    return () => unsub()
  }, [scrollYProgress, reachedThreshold])

  return (
    <div ref={containerRef} className="min-h-[300vh] relative">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
            <color attach="background" args={['#0a0015']} />
            <ambientLight intensity={0.2} color="#a855f7" />
            <pointLight position={[0, 3, 5]} intensity={0.5} color="#a855f7" />
            <SyrupParticles count={500} density={1} />
            <group position={[0, 0.5, 0]} scale={new THREE.Vector3(1, waveScale, 1)}>
              <Waveform3D color="#a855f7" />
            </group>
          </Canvas>
        </div>

        <div className="absolute inset-0 z-10 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm text-[#8b949e] hover:text-white transition-colors no-underline"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <motion.span className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: '#a855f7', opacity: titleOpacity }}>
              ScrewAI
            </motion.span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
            <motion.div style={{ opacity: titleOpacity }}>
              <h1 className="text-5xl sm:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
                The{' '}
                <span className="bg-gradient-to-r from-[#a855f7] to-[#4a0080] bg-clip-text text-transparent">
                  slow
                </span>{' '}
                melts your mind.
              </h1>
              <p className="text-lg sm:text-xl mt-4 max-w-lg mx-auto" style={{ color: '#8b949e' }}>
                Scroll to slow it down. The deeper you go, the thicker it gets.
              </p>
            </motion.div>

            <motion.div
              style={{ opacity: variationsReveal }}
              className="mt-16"
            >
              <div className="px-8 py-6 rounded-2xl border" style={{ borderColor: 'rgba(168, 85, 247, 0.3)', background: 'rgba(168, 85, 247, 0.05)' }}>
                <span className="text-4xl font-black bg-gradient-to-r from-[#a855f7] to-[#d8b4fe] bg-clip-text text-transparent">
                  100 Variations Generated
                </span>
                <p className="text-sm mt-2" style={{ color: '#a855f7' }}>
                  Original preserved. All variations ready.
                </p>
              </div>
            </motion.div>

            <motion.p
              className="mt-12 text-xs"
              style={{ color: '#8b949e', opacity: useTransform(scrollYProgress, [0, 0.1], [1, 0]) }}
            >
              Scroll down ↓
            </motion.p>
          </div>

          <div className="px-6 py-4 flex justify-center gap-4 text-xs" style={{ color: '#8b949e' }}>
            <span>Waveform slowing...</span>
            <span style={{ color: '#a855f7' }}>●</span>
            <span>Pitch dropping...</span>
            <span style={{ color: '#a855f7' }}>●</span>
            <span>Purple thickening...</span>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  color?: string
  hoverIntensity?: number
  waveData?: Float32Array
}

const SEGMENTS = 128

export default function Waveform3D({ color = '#00f0ff', hoverIntensity = 0, waveData }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const hoverRef = useRef(0)
  hoverRef.current = hoverIntensity

  const { geometry, baseY } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(SEGMENTS * 3)
    const base = new Float32Array(SEGMENTS)
    for (let i = 0; i < SEGMENTS; i++) {
      const x = (i / (SEGMENTS - 1) - 0.5) * 8
      const y = (Math.sin(i * 0.5) + Math.sin(i * 0.13)) * 0.3
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = 0
      base[i] = y
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geometry: geo, baseY: base }
  }, [])

  useFrame((state) => {
    if (!meshRef.current) return
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array
    const time = state.clock.getElapsedTime()
    const h = hoverRef.current

    for (let i = 0; i < SEGMENTS; i++) {
      const wave = waveData ? waveData[i % waveData.length] : 0
      const anim = (Math.sin(i * 0.3 + time * 2) + Math.sin(i * 0.1 + time * 1.3)) * 0.2
      pos[i * 3 + 1] = baseY[i] + anim + wave * 1.5 + h * Math.sin(i * 0.5 + time)
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  )
}

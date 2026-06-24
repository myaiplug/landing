import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  color: string
  direction: { x: number; y: number }
  exploded: boolean
}

const PARTICLE_COUNT = 200

export default function StemStream({ color, direction, exploded }: Props) {
  const meshRef = useRef<THREE.Points>(null)
  const offsets = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.5
      arr[i * 3 + 1] = (Math.random() - 0.5) * 0.5
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.5
    }
    return arr
  }, [])
  const progress = useRef(0)

  useEffect(() => { progress.current = 0 }, [exploded])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array
    if (exploded) {
      progress.current = Math.min(1, progress.current + delta * 0.8)
      const ease = 1 - Math.pow(1 - progress.current, 3)
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3] = offsets[i * 3] + direction.x * ease * 4
        pos[i * 3 + 1] = offsets[i * 3 + 1] + direction.y * ease * 4
        pos[i * 3 + 2] = offsets[i * 3 + 2] + (Math.random() - 0.5) * ease * 2
      }
    } else {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3] = offsets[i * 3]
        pos[i * 3 + 1] = offsets[i * 3 + 1]
        pos[i * 3 + 2] = offsets[i * 3 + 2]
      }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true
  })

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))
    return geo
  }, [])

  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial
        size={0.08}
        color={color}
        transparent
        opacity={0.7}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

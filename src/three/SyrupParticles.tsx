import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  count?: number
  density?: number
}

export default function SyrupParticles({ count = 500, density = 1 }: Props) {
  const meshRef = useRef<THREE.Points>(null)

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2
      vel[i * 3] = (Math.random() - 0.5) * 0.005
      vel[i * 3 + 1] = -Math.random() * 0.01 * density
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003
      sizes[i] = 0.03 + Math.random() * 0.08
    }
    return { pos, vel, sizes }
  }, [count, density])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(data.sizes, 1))
    return geo
  }, [data])

  useFrame(() => {
    if (!meshRef.current) return
    const pos = meshRef.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      pos[i * 3] += data.vel[i * 3]
      pos[i * 3 + 1] += data.vel[i * 3 + 1]
      pos[i * 3 + 2] += data.vel[i * 3 + 2]
      if (pos[i * 3 + 1] < -10) pos[i * 3 + 1] = 10
      if (Math.abs(pos[i * 3]) > 10) data.vel[i * 3] *= -1
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial
        size={0.06}
        color="#a855f7"
        transparent
        opacity={0.25 * density}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

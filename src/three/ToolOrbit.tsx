import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface ToolCard {
  label: string
  color: string
  icon: string
  route: string
}

interface Props {
  tools: ToolCard[]
  active: boolean
}

export default function ToolOrbit({ tools, active }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const cards = useMemo(() => {
    return tools.map((tool, i) => {
      const angle = (i / tools.length) * Math.PI * 2
      const radius = 3.5
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 128
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#111118'
      ctx.beginPath()
      ctx.roundRect(0, 0, 256, 128, 16)
      ctx.fill()
      ctx.strokeStyle = tool.color + '40'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(0, 0, 256, 128, 16)
      ctx.stroke()
      ctx.fillStyle = tool.color
      ctx.font = 'bold 20px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(tool.icon, 128, 52)
      ctx.fillStyle = '#e4e4e7'
      ctx.font = 'bold 18px Inter, sans-serif'
      ctx.fillText(tool.label, 128, 90)
      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0 })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
      sprite.scale.set(2, 1, 1)
      const startAngle = angle
      return { sprite, startAngle, mat: spriteMat }
    })
  }, [tools])

  useFrame((state) => {
    if (!groupRef.current) return
    cards.forEach((card) => {
      const targetOpacity = active ? 1 : 0
      card.mat.opacity += (targetOpacity - card.mat.opacity) * 0.03
      const angle = card.startAngle + state.clock.getElapsedTime() * 0.2
      const radius = active ? 3.5 : 0
      card.sprite.position.x = Math.cos(angle) * radius
      card.sprite.position.y = Math.sin(angle) * radius * 0.6
    })
  })

  return (
    <group ref={groupRef}>
      {cards.map((card) => (
        <primitive key={card.sprite.uuid} object={card.sprite} />
      ))}
    </group>
  )
}

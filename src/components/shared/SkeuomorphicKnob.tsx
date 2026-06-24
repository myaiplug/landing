import { useEffect, useRef, useCallback } from 'react'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const fmtValue = (v: number, p: { step: number; scale?: string; min: number; unit: string }) => {
  const decimals = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : 2
  return v.toFixed(decimals)
}

export default function SkeuomorphicKnob({
  param, value, onChange, size = 64, color = '#d4af37', disabled = false,
}: {
  param: { id: string; label: string; min: number; max: number; step: number; unit: string; default: number; scale?: string }
  value: number
  onChange: (v: number) => void
  size?: number
  color?: string
  disabled?: boolean
}) {
  const dragRef = useRef({ active: false, startY: 0, startVal: 0 })

  const min = param.min
  const max = param.max
  const range = max - min
  const useLog = param.scale === 'log' && min > 0 && max > 0

  const valueToNorm = useCallback((v: number) => {
    if (useLog) { const lo = Math.log(min); const hi = Math.log(max); return (Math.log(Math.max(min, v)) - lo) / (hi - lo) }
    return (v - min) / range
  }, [min, max, range, useLog])

  const normToValue = useCallback((n: number) => {
    const nn = clamp(n, 0, 1)
    if (useLog) { const lo = Math.log(min); const hi = Math.log(max); return Math.exp(lo + nn * (hi - lo)) }
    return min + nn * range
  }, [min, max, range, useLog])

  const norm = valueToNorm(value)
  const startAngle = -135
  const endAngle = 135
  const angle = startAngle + norm * (endAngle - startAngle)

  const onMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current.active) return
    const dy = dragRef.current.startY - e.clientY
    const sensitivity = e.shiftKey ? 600 : 200
    const newNorm = clamp(dragRef.current.startVal + dy / sensitivity, 0, 1)
    const stepped = Math.round(normToValue(newNorm) / param.step) * param.step
    const finalV = clamp(stepped, min, max)
    if (finalV !== value) onChange(finalV)
  }, [value, onChange, param.step, min, max, normToValue])

  const endDrag = useCallback(() => {
    dragRef.current.active = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', endDrag)
  }, [onMove])

  const startDrag = (e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    dragRef.current = { active: true, startY: e.clientY, startVal: norm }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', endDrag)
  }

  useEffect(() => () => endDrag(), [endDrag])

  const onDoubleClick = () => { if (!disabled) onChange(param.default) }
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return; e.preventDefault()
    const step = e.shiftKey ? param.step * 5 : param.step
    const next = clamp(value + (e.deltaY < 0 ? step : -step), min, max)
    if (next !== value) onChange(next)
  }

  const ticks = 11
  const tickEls: React.ReactNode[] = []
  for (let i = 0; i < ticks; i++) {
    const t = i / (ticks - 1)
    const a = startAngle + t * (endAngle - startAngle)
    const rad = (a - 90) * Math.PI / 180
    const r1 = size / 2 - 4; const r2 = size / 2 - 9
    const x1 = size / 2 + Math.cos(rad) * r1; const y1 = size / 2 + Math.sin(rad) * r1
    const x2 = size / 2 + Math.cos(rad) * r2; const y2 = size / 2 + Math.sin(rad) * r2
    const major = i === 0 || i === ticks - 1 || i === Math.floor((ticks - 1) / 2)
    tickEls.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i / (ticks - 1) <= norm ? color : '#3a3a44'} strokeWidth={major ? 1.5 : 0.75} strokeLinecap="round" opacity={major ? 1 : 0.6} />)
  }

  const arcR = size / 2 - 11; const arcCx = size / 2; const arcCy = size / 2
  const startRad = (startAngle - 90) * Math.PI / 180
  const endRad = (angle - 90) * Math.PI / 180
  const x1 = arcCx + Math.cos(startRad) * arcR; const y1 = arcCy + Math.sin(startRad) * arcR
  const x2 = arcCx + Math.cos(endRad) * arcR; const y2 = arcCy + Math.sin(endRad) * arcR
  const large = (angle - startAngle) > 180 ? 1 : 0
  const showArc = norm > 0.001

  return (
    <div className="knob-wrap" style={{ width: size, opacity: disabled ? 0.4 : 1 }}>
      <svg width={size} height={size} onMouseDown={startDrag} onDoubleClick={onDoubleClick} onWheel={onWheel} className="knob-svg" style={{ cursor: disabled ? 'not-allowed' : 'ns-resize' }}>
        <defs>
          <radialGradient id={`kb-${size}-${color.replace('#', '')}`} cx="50%" cy="38%" r="60%">
            <stop offset="0%" stopColor="#4a4a55" /><stop offset="55%" stopColor="#1c1c24" /><stop offset="100%" stopColor="#08080c" />
          </radialGradient>
          <radialGradient id={`ks-${size}-${color.replace('#', '')}`} cx="30%" cy="25%" r="40%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.6)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        {tickEls}
        {showArc && <path d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${large} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity={0.85} />}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 11} fill={`url(#kb-${size}-${color.replace('#', '')})`} stroke="#0a0a0f" strokeWidth="0.75" />
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 11} fill={`url(#ks-${size}-${color.replace('#', '')})`} />
        <g transform={`rotate(${angle} ${size / 2} ${size / 2})`}>
          <line x1={size / 2} y1={size / 2 - (size / 2 - 14)} x2={size / 2} y2={size / 2 - 4} stroke={color} strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx={size / 2} cy={size / 2} r={2.5} fill="#0a0a0f" />
      </svg>
      <div className="knob-label" style={{ color }}>{param.label}</div>
      <div className="knob-value">{fmtValue(value, param)}{param.unit ? ` ${param.unit}` : ''}</div>
    </div>
  )
}

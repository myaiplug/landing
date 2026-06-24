import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Upload, Play, Pause, ArrowLeft, AlertCircle, RotateCcw, GitCompare, Volume2, Link2, Unlink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { computeWaveform, formatTime, isAudioLikeFile } from '../../engines/audio'

const drawWaveform = (canvas: HTMLCanvasElement, wave: { min: number; max: number }[] | null, opts: { activeColor: string; inactiveColor: string; activeWidth: number; dim: boolean; playX: number | null }) => {
  if (!canvas || !wave) return
  const ctx = canvas.getContext('2d')!; const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect()
  const w = rect.width, h = rect.height; if (w === 0 || h === 0) return
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const midY = h / 2; ctx.fillStyle = '#06060a'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke()
  const step = w / wave.length; ctx.globalAlpha = opts.dim ? 0.45 : 1
  for (let i = 0; i < wave.length; i++) { const p = wave[i]; const x = i * step; ctx.strokeStyle = opts.dim ? opts.inactiveColor : opts.activeColor; ctx.lineWidth = opts.activeWidth; ctx.beginPath(); ctx.moveTo(x, midY - p.max * (h / 2) * 0.85); ctx.lineTo(x, midY - p.min * (h / 2) * 0.85); ctx.stroke() }
  ctx.globalAlpha = 1
  if (opts.playX != null && opts.playX >= 0) { ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(opts.playX, 0); ctx.lineTo(opts.playX, h); ctx.stroke() }
}

export default function TestIT({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate()
  const goBack = onBack || (() => navigate('/'))
  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const [bufferA, setBufferA] = useState<AudioBuffer | null>(null)
  const [bufferB, setBufferB] = useState<AudioBuffer | null>(null)
  const [waveA, setWaveA] = useState<{ min: number; max: number }[] | null>(null)
  const [waveB, setWaveB] = useState<{ min: number; max: number }[] | null>(null)
  const [urlA, setUrlA] = useState<string | null>(null)
  const [urlB, setUrlB] = useState<string | null>(null)
  const [activeTrack, setActiveTrack] = useState('A')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [loop, setLoop] = useState(false)
  const [volumeA, setVolumeA] = useState(1)
  const [volumeB, setVolumeB] = useState(1)
  const [linked, setLinked] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 })

  const canvasARef = useRef<HTMLCanvasElement>(null)
  const canvasBRef = useRef<HTMLCanvasElement>(null)
  const hostARef = useRef<HTMLDivElement>(null)
  const hostBRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainARef = useRef<GainNode | null>(null)
  const gainBRef = useRef<GainNode | null>(null)
  const startTimeRef = useRef(0)
  const startOffsetRef = useRef(0)
  const rafRef = useRef(0)
  const loopRef = useRef(false)
  const activeRef = useRef('A')
  const volARef = useRef(1)
  const volBRef = useRef(1)

  useEffect(() => { loopRef.current = loop }, [loop])
  useEffect(() => { activeRef.current = activeTrack }, [activeTrack])
  useEffect(() => { volARef.current = volumeA }, [volumeA])
  useEffect(() => { volBRef.current = volumeB }, [volumeB])
  useEffect(() => { if (linked) { const target = activeTrack === 'A' ? volumeA : volumeB; if (activeTrack === 'A') setVolumeB(target); else setVolumeA(target) } }, [activeTrack, linked])

  const duration = Math.max(bufferA?.duration || 0, bufferB?.duration || 0)

  useEffect(() => { const measure = () => { if (hostARef.current) { const r = hostARef.current.getBoundingClientRect(); setHostSize({ w: r.width, h: r.height }) } }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure) }, [bufferA, bufferB])

  useEffect(() => { if (!ctxRef.current) return; const target = activeTrack === 'A' ? gainARef.current : gainBRef.current; const other = activeTrack === 'A' ? gainBRef.current : gainARef.current; if (target) target.gain.value = volARef.current; if (other) other.gain.value = 0 }, [activeTrack, bufferA, bufferB])
  useEffect(() => { const a = gainARef.current; const b = gainBRef.current; if (!a || !b) return; if (activeTrack === 'A') { a.gain.value = volARef.current; b.gain.value = 0 } else { a.gain.value = 0; b.gain.value = volBRef.current } }, [volumeA, volumeB, activeTrack, bufferA, bufferB])

  const sourceARef = useRef<AudioBufferSourceNode | null>(null)
  const sourceBRef = useRef<AudioBufferSourceNode | null>(null)

  const ensureCtx = useCallback(() => {
    if (ctxRef.current) return ctxRef.current
    const ctx = new AudioContext(); const gainA = ctx.createGain(); const gainB = ctx.createGain()
    gainA.connect(ctx.destination); gainB.connect(ctx.destination); gainA.gain.value = 1; gainB.gain.value = 0
    gainARef.current = gainA; gainBRef.current = gainB; ctxRef.current = ctx; return ctx
  }, [])

  const loadFile = useCallback(async (file: File, track: string) => {
    if (!isAudioLikeFile(file)) { setError('Unsupported file.'); return }
    setError(null)
    try { const ctx = ensureCtx(); const arrayBuffer = await file.arrayBuffer(); const audioBuffer = await ctx.decodeAudioData(arrayBuffer); const wave = computeWaveform(audioBuffer, 500); const url = URL.createObjectURL(file)
      const setter = () => { if (track === 'A') { if (urlA) URL.revokeObjectURL(urlA); setFileA(file); setBufferA(audioBuffer); setWaveA(wave); setUrlA(url) } else { if (urlB) URL.revokeObjectURL(urlB); setFileB(file); setBufferB(audioBuffer); setWaveB(wave); setUrlB(url) } }
      if (ctx.state === 'suspended') await ctx.resume(); setter()
    } catch (err: any) { setError('Could not decode file.'); console.error(err) }
  }, [urlA, urlB, ensureCtx])

  useEffect(() => { drawWaveform(canvasARef.current!, waveA!, { activeColor: '#d4af37', inactiveColor: '#4b5563', activeWidth: 1.5, dim: activeTrack !== 'A', playX: hostSize.w > 0 ? (playbackTime / Math.max(0.001, duration)) * hostSize.w : null }) }, [waveA, activeTrack, playbackTime, duration, hostSize])
  useEffect(() => { drawWaveform(canvasBRef.current!, waveB!, { activeColor: '#8b5cf6', inactiveColor: '#4b5563', activeWidth: 1.5, dim: activeTrack !== 'B', playX: hostSize.w > 0 ? (playbackTime / Math.max(0.001, duration)) * hostSize.w : null }) }, [waveB, activeTrack, playbackTime, duration, hostSize])

  const startSourcesAt = useCallback((when: number) => {
    const ctx = ctxRef.current; if (!ctx || !bufferA || !bufferB) return
    try { sourceARef.current?.stop() } catch {} try { sourceBRef.current?.stop() } catch {}
    const srcA = ctx.createBufferSource(); srcA.buffer = bufferA; srcA.loop = false; srcA.connect(gainARef.current!)
    const srcB = ctx.createBufferSource(); srcB.buffer = bufferB; srcB.loop = false; srcB.connect(gainBRef.current!)
    srcA.start(0, when % bufferA.duration); srcB.start(0, when % bufferB.duration)
    sourceARef.current = srcA; sourceBRef.current = srcB
    startTimeRef.current = ctx.currentTime; startOffsetRef.current = when
  }, [bufferA, bufferB])

  const stopPlayback = useCallback(() => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; try { sourceARef.current?.stop() } catch {} try { sourceBRef.current?.stop() } catch {}; setIsPlaying(false) }, [])

  const tickRef = useRef(() => {})
  tickRef.current = () => {
    if (!ctxRef.current) return
    const elapsed = ctxRef.current.currentTime - startTimeRef.current
    const t = startOffsetRef.current + elapsed
    if (duration > 0 && t >= duration) { if (loopRef.current) { startOffsetRef.current = 0; startTimeRef.current = ctxRef.current.currentTime; try { sourceARef.current?.stop() } catch {} try { sourceBRef.current?.stop() } catch {}; startSourcesAt(0); setPlaybackTime(0) } else { stopPlayback(); setPlaybackTime(duration); return } }
    else setPlaybackTime(t)
    rafRef.current = requestAnimationFrame(tickRef.current)
  }

  const togglePlayback = useCallback(() => {
    const ctx = ensureCtx(); if (ctx.state === 'suspended') ctx.resume()
    if (isPlaying) { stopPlayback(); return }
    if (!bufferA || !bufferB) return; const offset = playbackTime >= duration - 0.05 ? 0 : playbackTime
    startSourcesAt(offset); setIsPlaying(true); rafRef.current = requestAnimationFrame(tickRef.current)
  }, [bufferA, bufferB, isPlaying, playbackTime, duration, startSourcesAt, ensureCtx, stopPlayback])

  const seek = useCallback((frac: number) => {
    const wasPlaying = isPlaying; const t = Math.max(0, Math.min(1, frac)) * duration
    if (wasPlaying) { stopPlayback(); startSourcesAt(t); setIsPlaying(true); rafRef.current = requestAnimationFrame(tickRef.current) } else setPlaybackTime(t)
  }, [isPlaying, duration, startSourcesAt, stopPlayback])

  const resetAll = () => { stopPlayback(); if (urlA) URL.revokeObjectURL(urlA); if (urlB) URL.revokeObjectURL(urlB); setFileA(null); setFileB(null); setBufferA(null); setBufferB(null); setWaveA(null); setWaveB(null); setUrlA(null); setUrlB(null); setPlaybackTime(0); setIsPlaying(false); setActiveTrack('A') }
  useEffect(() => () => { stopPlayback(); if (urlA) URL.revokeObjectURL(urlA); if (urlB) URL.revokeObjectURL(urlB); ctxRef.current?.close() }, [])

  const bothLoaded = bufferA && bufferB

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-[rgba(139,92,246,0.1)] flex items-center justify-center"><GitCompare className="w-6 h-6 text-[#8b5cf6]" /></div><div><h2 className="text-2xl font-black text-white tracking-tight">TestIT</h2><p className="text-sm text-[#71717a]">A/B compare in real time</p></div></div>
          {bothLoaded && <button onClick={resetAll} className="p-2 rounded-lg hover:bg-white/5 text-[#71717a]"><RotateCcw className="w-4 h-4" /></button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {['A', 'B'].map(track => {
            const file = track === 'A' ? fileA : fileB; const buffer = track === 'A' ? bufferA : bufferB
            const isActive = activeTrack === track; const accent = track === 'A' ? '#d4af37' : '#8b5cf6'
            const canvasRef = track === 'A' ? canvasARef : canvasBRef; const hostRef = track === 'A' ? hostARef : hostBRef
            return <div key={track} className={`rounded-2xl border p-5 transition-all bg-black/30 ${isActive ? (track === 'A' ? 'border-[rgba(212,175,55,0.6)]' : 'border-[rgba(139,92,246,0.6)]') : 'border-[rgba(255,255,255,0.06)]'}`}>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setActiveTrack(track)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isActive ? '' : 'text-[#71717a] hover:text-white'}`} style={isActive ? { background: `${accent}25`, color: 'white' } : {}}>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ background: isActive ? accent : '#2a2a32', color: isActive ? '#000' : '#888' }}>{track}</span>
                  {file ? file.name : `Load Track ${track}`}
                </button>
              </div>
              {!buffer ? <div onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*,.mp3,.wav,.m4a,.mp4'; input.onchange = (e: any) => e.target.files[0] && loadFile(e.target.files[0], track); input.click() }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f, track) }} className="rounded-xl border-2 border-dashed border-[rgba(255,255,255,0.06)] p-8 text-center cursor-pointer hover:border-[rgba(255,255,255,0.15)] transition-all">
                <Upload className="w-8 h-8 mx-auto mb-2 text-[#3f3f46]" /><p className="text-sm text-[#71717a]">Drop or click to load</p>
              </div> : <div ref={hostRef as React.RefObject<HTMLDivElement>} className="wave-host h-32"><canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} style={{ width: '100%', height: '100%', cursor: 'pointer' }} onClick={(e) => { if (!duration) return; const rect = (e.target as HTMLCanvasElement).getBoundingClientRect(); const x = e.clientX - rect.left; seek(x / rect.width) }} /></div>}
            </div>
          })}
        </div>
        {bothLoaded && <div className="mt-7 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setActiveTrack('A')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTrack === 'A' ? 'bg-[rgba(212,175,55,0.2)] text-[#d4af37] border border-[rgba(212,175,55,0.4)]' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white'}`}>A</button>
            <button onClick={togglePlayback} className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] text-white font-bold text-sm inline-flex items-center gap-2">{isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{isPlaying ? 'Pause' : 'Play'} {activeTrack}</button>
            <button onClick={() => setActiveTrack('B')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTrack === 'B' ? 'bg-[rgba(139,92,246,0.2)] text-[#8b5cf6] border border-[rgba(139,92,246,0.4)]' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white'}`}>B</button>
            <button onClick={() => setLoop(!loop)} className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${loop ? 'bg-[rgba(139,92,246,0.2)] text-[#8b5cf6] border border-[rgba(139,92,246,0.3)]' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a]'}`}>Loop {loop ? 'ON' : 'OFF'}</button>
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-xs text-[#71717a] uppercase tracking-widest">Vol A</span>
            <input type="range" min="0" max="1" step="0.01" value={volumeA} onChange={(e) => { const v = Number(e.target.value); setVolumeA(v); if (linked) setVolumeB(v) }} className="w-32 accent-nodaw-gold" />
            <button onClick={() => setLinked(!linked)} className={`p-2 rounded-lg ${linked ? 'text-[#d4af37]' : 'text-[#71717a]'}`}>{linked ? <Link2 className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}</button>
            <input type="range" min="0" max="1" step="0.01" value={volumeB} onChange={(e) => { const v = Number(e.target.value); setVolumeB(v); if (linked) setVolumeA(v) }} className="w-32 accent-nodaw-purple" />
            <span className="text-xs text-[#71717a] uppercase tracking-widest">Vol B</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-[#71717a] font-mono"><Volume2 className="w-3 h-3" /><span>{formatTime(playbackTime)} / {formatTime(duration)}</span></div>
          <p className="text-center text-xs text-[#71717a]">Click waveform to seek. Tap A/B to switch.</p>
        </div>}
        {error && <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">{error}</p></div>}
      </motion.div>
    </div>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Play, Pause, Download, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Power, Trash2, Sparkles, Volume2, ChevronRight, AudioWaveform, Sliders, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { decodeAudioFile, encodeWAV, encodeMP3, computeWaveform, formatTime, getFileNameWithoutExt, isAudioLikeFile, FX_DEFS, FX_CATEGORIES, FX_PRESETS, fxNodeFromPresetNode, makeFxNode, applyFxNode, renderFxChain } from '../../engines/audio'
import { bus } from '../../engines/bus'
import SkeuomorphicKnob from '../../components/shared/SkeuomorphicKnob'

const CATEGORY_COLORS: Record<string, string> = { Dynamics: '#22d3ee', Filter: '#d4af37', Time: '#8b5cf6', Space: '#f43f5e', Modulation: '#a78bfa', Distortion: '#fbbf24', Utility: '#71717a' }
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = { Dynamics: Volume2, Filter: Sliders, Time: ChevronRight, Space: Sparkles, Modulation: AudioWaveform, Distortion: Power, Utility: Sparkles }

const WavePreview = ({ wave, duration, position, isPlaying }: { wave: { min: number; max: number }[]; duration: number; position: number; isPlaying: boolean }) => {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!; const dpr = window.devicePixelRatio || 1; const rect = c.getBoundingClientRect(); const w = rect.width, h = rect.height
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const midY = h / 2; ctx.fillStyle = '#06060a'; ctx.fillRect(0, 0, w, h); const step = w / wave.length
    for (let i = 0; i < wave.length; i++) { const p = wave[i]; const x = i * step; ctx.strokeStyle = isPlaying ? '#d4af37' : '#9aa3b2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, midY - p.max * (h / 2) * 0.82); ctx.lineTo(x, midY - p.min * (h / 2) * 0.82); ctx.stroke() }
    if (position > 0) { const px = (position / duration) * w; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke() }
  }, [wave, position, duration, isPlaying])
  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />
}

export default function FxIT({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate()
  const goBack = onBack || (() => navigate('/'))
  const [file, setFile] = useState<File | null>(null)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [wave, setWave] = useState<{ min: number; max: number }[] | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [chain, setChain] = useState<any[]>([])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('Dynamics')
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isRenderingPreview, setIsRenderingPreview] = useState(false)
  const [previewPosition, setPreviewPosition] = useState(0)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [exportFormat, setExportFormat] = useState('wav')
  const [history, setHistory] = useState<any[][]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const previewStartedAtRef = useRef(0)
  const previewOffsetRef = useRef(0)
  const animFrameRef = useRef(0)
  const previewBufRef = useRef<AudioBuffer | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const renderBufferToWavUrl = async (buf: AudioBuffer) => { const blob = encodeWAV(buf); return URL.createObjectURL(blob) }

  useEffect(() => { const off = bus.on('fxit:loadRegion', async (payload: any) => { try { setError(null); setAudioBuffer(payload.buffer); setWave(computeWaveform(payload.buffer, 600)); const url = await renderBufferToWavUrl(payload.buffer); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(url); setChain([]); setHistory([]); setResultBlob(null); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultUrl(null) } catch (e: any) { setError('Could not load region: ' + e.message) } }); return () => off() }, [previewUrl, resultUrl])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); if (resultUrl) URL.revokeObjectURL(resultUrl); ctxRef.current?.close(); cancelAnimationFrame(animFrameRef.current) }, [])

  const handleFile = useCallback(async (f: File) => {
    if (!isAudioLikeFile(f)) { setError('Unsupported file.'); return }
    setError(null); if (previewUrl) URL.revokeObjectURL(previewUrl); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultBlob(null); setResultUrl(null); setChain([]); setHistory([]); setFile(f)
    try { const { audioBuffer: buf } = await decodeAudioFile(f); setAudioBuffer(buf); setWave(computeWaveform(buf, 600)); setPreviewUrl(URL.createObjectURL(f)) } catch { setError('Could not decode file.') }
  }, [previewUrl, resultUrl])

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }, [handleFile])
  const ensureCtx = () => { if (ctxRef.current) return ctxRef.current; ctxRef.current = new AudioContext(); return ctxRef.current }
  const addToHistory = (prevChain: any[]) => setHistory(h => [...h.slice(-49), prevChain])
  const updateNode = (id: string, updater: (n: any) => any) => setChain(c => c.map(n => n.id === id ? { ...n, ...updater(n) } : n))
  const setNodeParam = (id: string, key: string, value: number) => { addToHistory(chain); updateNode(id, (n: any) => ({ params: { ...n.params, [key]: value } })) }
  const toggleNode = (id: string) => { addToHistory(chain); setChain(c => c.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n)) }
  const removeNode = (id: string) => { addToHistory(chain); setChain(c => c.filter(n => n.id !== id)); if (activeNodeId === id) setActiveNodeId(null) }
  const moveNode = (id: string, dir: number) => { addToHistory(chain); setChain(c => { const idx = c.findIndex(n => n.id === id); if (idx < 0) return c; const ni = idx + dir; if (ni < 0 || ni >= c.length) return c; const next = c.slice(); const [it] = next.splice(idx, 1); next.splice(ni, 0, it); return next }) }
  const applyPreset = (presetId: string) => { const p = FX_PRESETS.find(p => p.id === presetId); if (!p) return; addToHistory(chain); const nc = p.chain.map(p => fxNodeFromPresetNode(p)); setChain(nc); setActiveNodeId(nc[0]?.id || null) }
  const addEffect = (type: string) => { addToHistory(chain); const node = makeFxNode(type); if (!node) return; setChain(c => [...c, node]); setActiveNodeId(node.id) }
  const undo = () => { if (history.length === 0) return; const last = history[history.length - 1]; setHistory(h => h.slice(0, -1)); setChain(last) }
  const stopPreview = useCallback(() => { try { previewSourceRef.current?.stop() } catch {} previewSourceRef.current = null; cancelAnimationFrame(animFrameRef.current); setIsPreviewing(false) }, [])

  const previewFxApplied = useCallback(async () => {
    if (!audioBuffer) return; stopPreview(); setIsRenderingPreview(true)
    try {
      const rendered = await renderFxChain(audioBuffer, chain.map(applyFxNode)); previewBufRef.current = rendered
      const url = await renderBufferToWavUrl(rendered); if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = url
      const ctx = ensureCtx(); if (ctx.state === 'suspended') await ctx.resume()
      const src = ctx.createBufferSource(); src.buffer = rendered; const gain = ctx.createGain(); gain.gain.value = 0.9
      src.connect(gain).connect(ctx.destination); previewSourceRef.current = src; previewStartedAtRef.current = ctx.currentTime; previewOffsetRef.current = 0; setPreviewPosition(0); setIsPreviewing(true); src.start(0)
      const tickFn = () => { if (!previewSourceRef.current) return; const t = (ctx.currentTime - previewStartedAtRef.current) + previewOffsetRef.current; if (t >= rendered.duration) { stopPreview(); return }; setPreviewPosition(t); animFrameRef.current = requestAnimationFrame(tickFn) }
      animFrameRef.current = requestAnimationFrame(tickFn)
    } catch (e: any) { setError('Preview render failed: ' + e.message) } finally { setIsRenderingPreview(false) }
  }, [audioBuffer, chain, stopPreview])

  const previewDry = useCallback(() => {
    if (!audioBuffer) return; stopPreview(); const ctx = ensureCtx(); if (ctx.state === 'suspended') ctx.resume()
    const src = ctx.createBufferSource(); src.buffer = audioBuffer; const gain = ctx.createGain(); gain.gain.value = 0.9; src.connect(gain).connect(ctx.destination)
    previewSourceRef.current = src; previewStartedAtRef.current = ctx.currentTime; previewOffsetRef.current = 0; setPreviewPosition(0); setIsPreviewing(true); src.start(0)
    const tickFn = () => { if (!previewSourceRef.current) return; const t = (ctx.currentTime - previewStartedAtRef.current) + previewOffsetRef.current; if (t >= audioBuffer.duration) { stopPreview(); return }; setPreviewPosition(t); animFrameRef.current = requestAnimationFrame(tickFn) }
    animFrameRef.current = requestAnimationFrame(tickFn)
  }, [audioBuffer, stopPreview])

  const applyAndDownload = useCallback(async () => {
    if (!audioBuffer) return; setIsProcessing(true); setError(null); stopPreview()
    try { const rendered = await renderFxChain(audioBuffer, chain.map(applyFxNode)); const blob = exportFormat === 'wav' ? encodeWAV(rendered) : await encodeMP3(rendered, 192); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultBlob(blob); setResultUrl(URL.createObjectURL(blob)) }
    catch (e: any) { setError('Export failed: ' + e.message) } finally { setIsProcessing(false) }
  }, [audioBuffer, chain, exportFormat, resultUrl, stopPreview])

  const downloadResult = () => { if (!resultBlob) return; const a = document.createElement('a'); a.href = resultUrl!; a.download = getFileNameWithoutExt(file?.name || 'audio') + '_fx.' + exportFormat; a.click() }

  const activeNode = chain.find((n: any) => n.id === activeNodeId)
  const activeDef = activeNode ? FX_DEFS[activeNode.type] : null

  if (resultBlob) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong rounded-3xl p-10 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10 text-green-400" /></div>
        <h2 className="text-3xl font-black text-white tracking-tight mb-2">FX Rendered</h2>
        <p className="text-[#71717a] mb-6">{formatTime(audioBuffer?.duration || 0)}</p>
        <audio src={resultUrl!} controls className="w-full rounded-xl mb-6" />
        <button onClick={downloadResult} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f59e0b] text-black font-black text-sm uppercase tracking-widest inline-flex items-center gap-2"><Download className="w-5 h-5" /> Download</button>
        <button onClick={() => { setResultBlob(null); setResultUrl(null) }} className="block mx-auto mt-4 text-sm text-[#71717a] hover:text-white transition-colors">Edit & Re-render</button>
      </motion.div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      {!audioBuffer ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-6"><div className="w-12 h-12 rounded-xl bg-[rgba(244,63,94,0.1)] flex items-center justify-center"><Sparkles className="w-6 h-6 text-[#f43f5e]" /></div><div><h2 className="text-2xl font-black text-white tracking-tight">FxIT</h2><p className="text-sm text-[#71717a]">Studio-grade effects chain</p></div></div>
          <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className="rounded-2xl border-2 border-dashed border-[rgba(255,255,255,0.06)] p-12 text-center cursor-pointer hover:border-[rgba(244,63,94,0.3)] transition-all">
            <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.mp4" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Upload className="w-10 h-10 mx-auto mb-3 text-[#3f3f46]" /><p className="text-white font-semibold">Drop audio here</p><p className="text-sm text-[#71717a] mt-1">Or send a region from TrimIT</p>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_280px] gap-5">
          <div className="fx-rack p-4">
            <div className="flex items-center gap-2 mb-3"><div className="fx-screw" /><span className="text-[10px] font-black uppercase tracking-widest text-[#71717a]">Categories</span><div className="fx-screw ml-auto" /></div>
            <div className="space-y-1">{FX_CATEGORIES.map(cat => { const Icon = CATEGORY_ICONS[cat]; const color = CATEGORY_COLORS[cat]; return <button key={cat} onClick={() => setActiveCategory(cat)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${activeCategory === cat ? 'bg-white/5' : 'hover:bg-white/5 text-[#71717a]'}`} style={activeCategory === cat ? { color } : {}}><Icon className="w-4 h-4" /><span>{cat}</span></button> })}</div>
            <div className="mt-5 mb-3 text-[10px] font-black uppercase tracking-widest text-[#71717a]">Presets</div>
            <div className="grid grid-cols-1 gap-1.5">{FX_PRESETS.map(p => <button key={p.id} onClick={() => applyPreset(p.id)} className="text-left px-3 py-2 rounded-lg text-xs font-semibold text-[#71717a] hover:text-white hover:bg-white/5 transition-all flex items-center justify-between"><span>{p.label}</span><span className="text-[10px] text-[#3f3f46]">{p.chain.length || 'clean'}</span></button>)}</div>
          </div>
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div><h2 className="text-xl font-black text-white tracking-tight">FxIT</h2><p className="text-xs text-[#71717a]">{file?.name}</p></div>
                <div className="flex items-center gap-2">
                  <button onClick={previewDry} disabled={isPreviewing || isRenderingPreview} className="tool-btn" title="Dry"><Play className="w-4 h-4" /></button>
                  <button onClick={previewFxApplied} disabled={isRenderingPreview} className="tool-btn active cyan" title="Preview FX">{isRenderingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}</button>
                  <button onClick={stopPreview} disabled={!isPreviewing} className="tool-btn" title="Stop"><Pause className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="wave-host h-28 mb-3">{wave && <WavePreview wave={wave} duration={audioBuffer.duration} position={previewPosition} isPlaying={isPreviewing} />}</div>
              <div className="flex items-center justify-between text-xs text-[#71717a] font-mono"><span>{formatTime(previewPosition)}</span><span>{isPreviewing ? 'PLAYING' : (isRenderingPreview ? 'RENDERING' : 'READY')}</span><span>{formatTime(audioBuffer.duration)}</span></div>
              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-[#71717a]">Chain: {chain.length} node{chain.length !== 1 ? 's' : ''}</div>
                <div className="flex items-center gap-2">
                  <button onClick={undo} disabled={history.length === 0} className="tool-btn" title="Undo"><RotateCcw className="w-4 h-4" /></button>
                  <div className="flex gap-1">{['wav', 'mp3'].map(f => <button key={f} onClick={() => setExportFormat(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${exportFormat === f ? 'bg-[#f43f5e] text-black' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white'}`}>{f.toUpperCase()}</button>)}</div>
                  <button onClick={applyAndDownload} disabled={isProcessing} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#f43f5e] to-[#d4af37] text-black font-black text-sm uppercase tracking-widest disabled:opacity-50 inline-flex items-center gap-2">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export</button>
                </div>
              </div>
            </motion.div>
            <div className="fx-rack p-4">
              <div className="flex items-center justify-between mb-3"><span className="text-[10px] font-black uppercase tracking-widest text-[#71717a]">{activeCategory} Effects</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.values(FX_DEFS).filter(d => d.category === activeCategory).map(d => <button key={d.id} onClick={() => addEffect(d.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white transition-all" style={{ borderColor: `${CATEGORY_COLORS[d.category]}30` }}>{d.label}</button>)}</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="fx-rack p-4">
              <div className="flex items-center justify-between mb-3"><span className="text-[10px] font-black uppercase tracking-widest text-[#71717a]">Chain</span><span className="text-[10px] text-[#3f3f46]">{chain.length}</span></div>
              {chain.length === 0 ? <p className="text-xs text-[#3f3f46] py-8 text-center">No effects. Pick a preset or effect.</p> : <div className="space-y-2">{chain.map((node: any, i: number) => { const def = FX_DEFS[node.type]; const color = CATEGORY_COLORS[def.category]; return <motion.div layout key={node.id} onClick={() => setActiveNodeId(node.id)} className={`fx-module p-3 cursor-pointer ${activeNodeId === node.id ? 'ring-1' : ''}`} style={{ color, ['--tw-ring-color' as string]: activeNodeId === node.id ? color : 'transparent' }}>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-[10px] font-mono text-[#3f3f46]">#{i + 1}</span><span className="text-sm font-bold text-white truncate">{def.label}</span></div>
                <div className="flex items-center gap-1"><button onClick={(e) => { e.stopPropagation(); moveNode(node.id, -1) }} className="p-1 text-[#3f3f46] hover:text-white">↑</button><button onClick={(e) => { e.stopPropagation(); moveNode(node.id, 1) }} className="p-1 text-[#3f3f46] hover:text-white">↓</button><button onClick={(e) => { e.stopPropagation(); toggleNode(node.id) }} className="p-1" style={{ color: node.enabled ? color : '#666' }}><Power className="w-3.5 h-3.5" /></button><button onClick={(e) => { e.stopPropagation(); removeNode(node.id) }} className="p-1 text-[#3f3f46] hover:text-[#f43f5e]"><Trash2 className="w-3.5 h-3.5" /></button></div></div></motion.div> })}</div>}
            </div>
            <AnimatePresence mode="wait">{activeNode && activeDef ? <motion.div key={activeNode.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="fx-rack p-4">
              <div className="flex items-center gap-2 mb-4"><div className="fx-screw" /><span className="text-xs font-black uppercase tracking-widest text-white">{activeDef.label}</span><div className="fx-screw ml-auto" /></div>
              <div className="grid grid-cols-2 gap-y-4 gap-x-2 justify-items-center">{activeDef.params.map((p: any) => <SkeuomorphicKnob key={p.id} param={p} value={activeNode.params[p.id] ?? p.default} onChange={(v) => setNodeParam(activeNode.id, p.id, v)} color={CATEGORY_COLORS[activeDef.category]} disabled={!activeNode.enabled} />)}</div>
            </motion.div> : <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fx-rack p-6 text-center"><Sliders className="w-8 h-8 text-[#3f3f46] mx-auto mb-2" /><p className="text-xs text-[#71717a]">Select a node to tweak.</p></motion.div>}</AnimatePresence>
          </div>
        </div>
      )}
      {error && <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">{error}</p></div>}
    </div>
  )
}

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Play, Pause, Download, ArrowLeft, Loader2, AlertCircle, CheckCircle2, RotateCcw, RotateCw, Scissors, SquareDashed, Wand2, Sliders, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { decodeAudioFile, encodeWAV, encodeMP3, computeWaveform, trimAudioBuffer, cutAudioBuffer, reverseAudioBuffer, applyFadeIn, applyFadeOut, cloneAudioBuffer, formatTime, getFileNameWithoutExt, isAudioLikeFile } from '../../engines/audio'
import { bus } from '../../engines/bus'

const TOOLS = [
  { id: 'select', label: 'Select', icon: SquareDashed, kbd: 'V' },
  { id: 'cut', label: 'Cut', icon: Scissors, kbd: 'C' },
  { id: 'fx', label: 'Send to FX', icon: Wand2, kbd: 'F' },
  { id: 'fade-in', label: 'Fade In', icon: Sliders, kbd: 'I' },
  { id: 'fade-out', label: 'Fade Out', icon: Sliders, kbd: 'O' },
  { id: 'reverse', label: 'Reverse', icon: RotateCcw, kbd: 'R' },
]

const drawWave = (canvas: HTMLCanvasElement, wave: { min: number; max: number }[] | null, opts: { duration: number; selectionStart?: number | null; selectionEnd?: number | null; playhead?: number; fadeIn?: number | null; fadeOut?: number | null; cutStart?: number | null; cutEnd?: number | null }) => {
  if (!canvas || !wave) return
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const w = rect.width, h = rect.height
  if (w === 0 || h === 0) return
  canvas.width = w * dpr; canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const midY = h / 2
  ctx.fillStyle = '#06060a'; ctx.fillRect(0, 0, w, h)
  const step = w / wave.length
  for (let i = 0; i < wave.length; i++) {
    const p = wave[i]; const x = i * step
    ctx.strokeStyle = '#9aa3b2'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, midY - p.max * (h / 2) * 0.82); ctx.lineTo(x, midY - p.min * (h / 2) * 0.82); ctx.stroke()
  }
  const { selectionStart, selectionEnd, playhead, fadeIn, fadeOut, cutStart, cutEnd } = opts
  if (selectionStart != null && selectionEnd != null && selectionStart < selectionEnd) {
    const x1 = (selectionStart / opts.duration) * w; const x2 = (selectionEnd / opts.duration) * w
    ctx.fillStyle = 'rgba(212, 175, 55, 0.14)'; ctx.fillRect(x1, 0, x2 - x1, h)
  }
  if (cutStart != null && cutEnd != null && cutStart < cutEnd) {
    const x1 = (cutStart / opts.duration) * w; const x2 = (cutEnd / opts.duration) * w
    ctx.fillStyle = 'rgba(244, 63, 94, 0.18)'; ctx.fillRect(x1, 0, x2 - x1, h)
    ctx.strokeStyle = '#f43f5e'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.moveTo(x2, 0); ctx.lineTo(x2, h); ctx.stroke(); ctx.setLineDash([])
  }
  if (fadeIn != null && fadeIn > 0) { const x = (fadeIn / opts.duration) * w; const g = ctx.createLinearGradient(0, 0, x, 0); g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, x, h) }
  if (fadeOut != null && fadeOut > 0) { const x = ((opts.duration - fadeOut) / opts.duration) * w; const g = ctx.createLinearGradient(x, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)'); ctx.fillStyle = g; ctx.fillRect(x, 0, w - x, h) }
  if (playhead != null && playhead >= 0) { const x = (playhead / opts.duration) * w; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
}

function useHistory<T>(initial: T) {
  const [stack, setStack] = useState<T[]>([initial])
  const [idx, setIdx] = useState(0)
  const push = useCallback((buf: T) => { setStack(s => { const trimmed = s.slice(0, idx + 1); const next = [...trimmed, buf]; if (next.length > 50) next.shift(); return next }); setIdx(i => Math.min(i + 1, 49)) }, [idx])
  const undo = useCallback(() => setIdx(i => Math.max(0, i - 1)), [])
  const redo = useCallback(() => setIdx(i => Math.min(stack.length - 1, i + 1)), [stack.length])
  const current = stack[idx] as T | undefined
  return { current, push, undo, redo, canUndo: idx > 0, canRedo: idx < stack.length - 1, reset: (b: T) => { setStack([b]); setIdx(0) } }
}

export default function TrimIT({ onBack, onSendToFx }: { onBack?: () => void; onSendToFx?: () => void }) {
  const navigate = useNavigate()
  const goBack = onBack || (() => navigate('/'))
  const [file, setFile] = useState<File | null>(null)
  const [wave, setWave] = useState<{ min: number; max: number }[] | null>(null)
  const [duration, setDuration] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [tool, setTool] = useState('select')
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [dragMode, setDragMode] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [fadeInSec, setFadeInSec] = useState(0)
  const [fadeOutSec, setFadeOutSec] = useState(0)
  const [showFadeInSlider, setShowFadeInSlider] = useState(false)
  const [showFadeOutSlider, setShowFadeOutSlider] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [exportFormat, setExportFormat] = useState('wav')

  const hostRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const playStartedAtRef = useRef(0)
  const playStartOffsetRef = useRef(0)
  const fadeInRef = useRef(0); useEffect(() => { fadeInRef.current = fadeInSec }, [fadeInSec])
  const fadeOutRef = useRef(0); useEffect(() => { fadeOutRef.current = fadeOutSec }, [fadeOutSec])

  const history = useHistory<AudioBuffer | null>(null)

  const draw = useCallback(() => {
    const canvas = hostRef.current?.querySelector('canvas')
    if (!canvas) return
    drawWave(canvas as HTMLCanvasElement, wave, { duration, selectionStart: tool === 'select' ? selStart : null, selectionEnd: tool === 'select' ? selEnd : null, cutStart: tool === 'cut' ? selStart : null, cutEnd: tool === 'cut' ? selEnd : null, playhead, fadeIn: tool === 'fade-in' || fadeInSec > 0 ? fadeInSec : null, fadeOut: tool === 'fade-out' || fadeOutSec > 0 ? fadeOutSec : null })
  }, [wave, duration, tool, selStart, selEnd, playhead, fadeInSec, fadeOutSec])

  useEffect(() => { draw() }, [draw])
  useEffect(() => { if (!hostRef.current) return; const ro = new ResizeObserver(() => draw()); ro.observe(hostRef.current); return () => ro.disconnect() }, [draw])

  const setBuffer = useCallback((buf: AudioBuffer, url: string) => {
    if (!buf) return; history.reset(buf)
    setWave(computeWaveform(buf, 800)); setDuration(buf.duration); setSelStart(null); setSelEnd(null); setPlayhead(0); setFadeInSec(0); setFadeOutSec(0)
    if (previewUrl && previewUrl !== url) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(url)
  }, [history, previewUrl])

  const handleFile = useCallback(async (f: File) => {
    if (!isAudioLikeFile(f)) { setError('Unsupported file.'); return }
    setError(null); setResultBlob(null); setResultUrl(null); setFile(f)
    try { const { audioBuffer: buf } = await decodeAudioFile(f); setBuffer(buf, URL.createObjectURL(f)) } catch (err: any) { setError('Could not decode file.'); console.error(err) }
  }, [setBuffer])

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }, [handleFile])

  const getTimeFromEvent = (e: React.MouseEvent | MouseEvent) => {
    if (!hostRef.current || !duration) return 0
    const rect = hostRef.current.getBoundingClientRect(); const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (!duration) return; e.preventDefault(); const t = getTimeFromEvent(e)
    if (tool === 'reverse') {
      const cur = history.current; if (!cur) return
      if (selStart != null && selEnd != null && selEnd > selStart) {
        const a = Math.floor(selStart * cur.sampleRate); const b = Math.floor(selEnd * cur.sampleRate)
        const slice = trimAudioBuffer(cur, selStart, selEnd); const reversed = reverseAudioBuffer(slice)
        const out = cloneAudioBuffer(cur)
        for (let ch = 0; ch < out.numberOfChannels; ch++) { const dst = out.getChannelData(ch); const src = reversed.getChannelData(ch); for (let i = 0; i < b - a; i++) dst[a + i] = src[i] }
        history.push(out); setWave(computeWaveform(out, 800))
      } else { const rev = reverseAudioBuffer(cur); history.push(rev); setWave(computeWaveform(rev, 800)) }
      return
    }
    if (tool === 'fade-in' || tool === 'fade-out') return
    setSelStart(t); setSelEnd(t); setDragMode(tool)
  }

  const onMouseMove = (e: MouseEvent) => { if (!dragMode) return; setSelEnd(getTimeFromEvent(e)) }
  const onMouseUp = () => {
    if (!dragMode) return; const a = Math.min(selStart ?? 0, selEnd ?? 0); const b = Math.max(selStart ?? 0, selEnd ?? 0); setSelStart(a); setSelEnd(b); setDragMode(null)
    const cur = history.current; if (!cur) return
    if (tool === 'cut' && a < b) { const out = cutAudioBuffer(cur, a, b); history.push(out); setWave(computeWaveform(out, 800)); setDuration(out.duration); setSelStart(null); setSelEnd(null) }
    else if (tool === 'fx' && a < b) { const region = trimAudioBuffer(cur, a, b); bus.emit('fxit:loadRegion', { buffer: region, fileName: file?.name || 'region', regionStart: a, regionEnd: b, fromTool: 'TrimIT' }); if (onSendToFx) onSendToFx(); setSelStart(null); setSelEnd(null) }
  }

  useEffect(() => {
    if (!dragMode) return
    const move = (e: MouseEvent) => onMouseMove(e); const up = () => onMouseUp()
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [dragMode, selStart, selEnd, tool, history, file])

  const togglePlay = useCallback(() => {
    const cur = history.current; if (!cur) return
    if (isPlaying) { audioRef.current?.pause(); cancelAnimationFrame(animFrameRef.current); setIsPlaying(false); return }
    const startAt = playhead >= duration - 0.05 ? 0 : playhead
    audioRef.current?.pause(); const audio = new Audio(previewUrl!); audio.currentTime = startAt; audioRef.current = audio
    audio.play().then(() => {
      playStartedAtRef.current = performance.now(); playStartOffsetRef.current = startAt; setIsPlaying(true)
      const update = () => {
        const t = playStartOffsetRef.current + (performance.now() - playStartedAtRef.current) / 1000
        if (t >= duration || audio.paused) { audio.pause(); setIsPlaying(false); setPlayhead(duration); return }
        setPlayhead(t); animFrameRef.current = requestAnimationFrame(update)
      }; animFrameRef.current = requestAnimationFrame(update)
    }).catch(() => setIsPlaying(false))
  }, [history.current, isPlaying, playhead, duration, previewUrl])

  useEffect(() => { if (!isPlaying) { cancelAnimationFrame(animFrameRef.current); audioRef.current?.pause() } }, [isPlaying])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if ((e.key === 'z') && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); history.redo() }
      else if ((e.key === 'z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); history.undo() }
      else if ('vVcCfFiIoOrR'.includes(e.key)) { const m: Record<string, string> = { v: 'select', c: 'cut', f: 'fx', i: 'fade-in', o: 'fade-out', r: 'reverse' }; setTool(m[e.key.toLowerCase()] || 'select') }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, history])

  const commitFadeIn = useCallback(() => { if (!history.current) return; const out = applyFadeIn(history.current, fadeInSec); history.push(out); setWave(computeWaveform(out, 800)); setShowFadeInSlider(false) }, [history, fadeInSec])
  const commitFadeOut = useCallback(() => { if (!history.current) return; const out = applyFadeOut(history.current, fadeOutSec); history.push(out); setWave(computeWaveform(out, 800)); setShowFadeOutSlider(false) }, [history, fadeOutSec])

  const exportResult = useCallback(async () => {
    if (!history.current) return; setIsProcessing(true); setError(null)
    try { const blob = exportFormat === 'wav' ? encodeWAV(history.current) : await encodeMP3(history.current, 192); if (resultUrl) URL.revokeObjectURL(resultUrl); setResultBlob(blob); setResultUrl(URL.createObjectURL(blob)) }
    catch (err: any) { setError('Export failed: ' + err.message) } finally { setIsProcessing(false) }
  }, [history.current, exportFormat, resultUrl])

  const downloadResult = () => { if (!resultBlob) return; const a = document.createElement('a'); a.href = resultUrl!; a.download = getFileNameWithoutExt(file?.name || 'audio') + '_trimmed.' + exportFormat; a.click() }
  const resetAll = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); if (resultUrl) URL.revokeObjectURL(resultUrl); setFile(null); setWave(null); setDuration(0); setSelStart(null); setSelEnd(null); setPlayhead(0); setIsPlaying(false); setFadeInSec(0); setFadeOutSec(0); setResultBlob(null); setResultUrl(null); history.reset(null) }

  const currentBuf = history.current

  const hostClass = useMemo(() => {
    if (tool === 'select') return 'wave-mode-select'
    if (tool === 'cut') return 'wave-mode-cut'
    if (tool === 'fx') return 'wave-mode-fx'
    return ''
  }, [tool])

  if (resultBlob) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong rounded-3xl p-10 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10 text-green-400" /></div>
        <h2 className="text-3xl font-black text-white tracking-tight mb-2">Exported</h2>
        <p className="text-[#71717a] mb-6">{formatTime(duration)} • {exportFormat.toUpperCase()}</p>
        <audio src={resultUrl!} controls className="w-full rounded-xl mb-6" />
        <button onClick={downloadResult} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#22d3ee] to-[#8b5cf6] text-black font-black text-sm uppercase tracking-widest inline-flex items-center gap-2"><Download className="w-5 h-5" /> Download</button>
        <button onClick={() => { setResultBlob(null); setResultUrl(null) }} className="block mx-auto mt-4 text-sm text-[#71717a] hover:text-white transition-colors">Edit & Re-export</button>
      </motion.div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[rgba(34,211,238,0.1)] flex items-center justify-center"><Scissors className="w-6 h-6 text-[#22d3ee]" /></div>
            <div><h2 className="text-2xl font-black text-white tracking-tight">TrimIT</h2><p className="text-sm text-[#71717a]">Cut, fade, reverse</p></div>
          </div>
          {currentBuf && <div className="flex items-center gap-1">
            <button onClick={history.undo} disabled={!history.canUndo} className="tool-btn" title="Undo"><RotateCcw className="w-4 h-4" /><span className="kbd">⌘Z</span></button>
            <button onClick={history.redo} disabled={!history.canRedo} className="tool-btn" title="Redo"><RotateCw className="w-4 h-4" /><span className="kbd">⇧⌘Z</span></button>
            <button onClick={resetAll} className="tool-btn danger"><X className="w-4 h-4" /></button>
          </div>}
        </div>
        {!currentBuf ? (
          <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${isDragging ? 'border-[#22d3ee] bg-[rgba(34,211,238,0.05)]' : 'border-[rgba(255,255,255,0.06)] hover:border-[rgba(34,211,238,0.3)]'}`}>
            <input ref={fileInputRef} type="file" accept="audio/*,video/mp4,.mp3,.wav,.m4a,.mp4" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Upload className="w-10 h-10 mx-auto mb-4 text-[#3f3f46]" /><p className="text-white font-semibold">Drop audio here</p><p className="text-sm text-[#71717a] mt-1">MP3, WAV, M4A, OGG, FLAC, MP4</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="text-white font-semibold text-sm truncate">{file?.name}</p><p className="text-xs text-[#71717a]">{formatTime(duration)}</p></div>
            </div>
            <div className={`wave-host h-44 ${hostClass}`} ref={hostRef} onMouseDown={onMouseDown}><canvas style={{ width: '100%', height: '100%' }} /></div>
            <div className="flex items-center justify-between text-xs text-[#71717a] font-mono"><span>{formatTime(playhead)}</span><span>{(selStart != null && selEnd != null) ? `${formatTime(selEnd - selStart)} selected` : 'No selection'}</span><span>{formatTime(duration)}</span></div>
            <div className="flex items-center gap-2 flex-wrap">
              {TOOLS.map(t => { const Icon = t.icon; return <button key={t.id} onClick={() => { setTool(t.id); if (t.id === 'fade-in') setShowFadeInSlider(true); if (t.id === 'fade-out') setShowFadeOutSlider(true); if (t.id !== 'fade-in') setShowFadeInSlider(false); if (t.id !== 'fade-out') setShowFadeOutSlider(false) }} className={`tool-btn ${tool === t.id ? 'active' : ''} ${t.id === 'fx' ? 'cyan' : ''}`}><Icon className="w-4 h-4" /><span className="kbd">{t.kbd}</span></button> })}
              <div className="w-px h-6 bg-[rgba(255,255,255,0.06)] mx-1" />
              <button onClick={togglePlay} className={`tool-btn ${isPlaying ? 'active cyan' : ''}`}>{isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}<span className="kbd">⎵</span></button>
            </div>
            <AnimatePresence>{showFadeInSlider && tool === 'fade-in' && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-black/40 p-4">
              <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-[#22d3ee] uppercase tracking-widest">Fade In</label><span className="text-xs font-mono text-[#22d3ee]">{fadeInSec.toFixed(2)}s</span></div>
              <input type="range" min="0" max={Math.max(0.1, duration * 0.5)} step="0.01" value={fadeInSec} onChange={(e) => setFadeInSec(Number(e.target.value))} className="w-full accent-nodaw-cyan" />
              <div className="flex items-center justify-end gap-2 mt-3"><button onClick={() => setShowFadeInSlider(false)} className="text-xs text-[#71717a] hover:text-white">Cancel</button><button onClick={commitFadeIn} className="text-xs px-3 py-1 rounded-lg bg-[#22d3ee] text-black font-bold">Apply</button></div>
            </motion.div>}</AnimatePresence>
            <AnimatePresence>{showFadeOutSlider && tool === 'fade-out' && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-black/40 p-4">
              <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-[#22d3ee] uppercase tracking-widest">Fade Out</label><span className="text-xs font-mono text-[#22d3ee]">{fadeOutSec.toFixed(2)}s</span></div>
              <input type="range" min="0" max={Math.max(0.1, duration * 0.5)} step="0.01" value={fadeOutSec} onChange={(e) => setFadeOutSec(Number(e.target.value))} className="w-full accent-nodaw-cyan" />
              <div className="flex items-center justify-end gap-2 mt-3"><button onClick={() => setShowFadeOutSlider(false)} className="text-xs text-[#71717a] hover:text-white">Cancel</button><button onClick={commitFadeOut} className="text-xs px-3 py-1 rounded-lg bg-[#22d3ee] text-black font-bold">Apply</button></div>
            </motion.div>}</AnimatePresence>
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#71717a] uppercase tracking-widest">Export</label>
                <div className="flex gap-1">{['wav', 'mp3'].map(f => <button key={f} onClick={() => setExportFormat(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${exportFormat === f ? 'bg-[#22d3ee] text-black' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white'}`}>{f.toUpperCase()}</button>)}</div>
              </div>
              <button onClick={exportResult} disabled={isProcessing} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#8b5cf6] text-white font-black text-sm uppercase tracking-widest disabled:opacity-50 inline-flex items-center gap-2">
                {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Download className="w-4 h-4" /> Export</>}
              </button>
            </div>
          </div>
        )}
        {error && <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">{error}</p></div>}
      </motion.div>
    </div>
  )
}

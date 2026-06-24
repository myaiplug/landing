import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Download, FileAudio, Loader2, CheckCircle2, AlertCircle, ArrowLeft, AudioWaveform, Film, X, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { decodeAudioFile, encodeWAV, encodeMP3, isAudioLikeFile, formatTime, getFileNameWithoutExt } from '../../engines/audio'

const OUTPUT_FORMATS = [
  { value: 'wav', label: 'WAV', sub: 'Lossless PCM 16-bit', color: '#22d3ee' },
  { value: 'mp3', label: 'MP3', sub: 'Compressed', color: '#d4af37' },
]
const MP3_BITRATES = [128, 192, 256, 320]

export default function ConvertIT({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate()
  const goBack = onBack || (() => navigate('/'))
  const [file, setFile] = useState<File | null>(null)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sourceKind, setSourceKind] = useState<string | null>(null)
  const [targetFormat, setTargetFormat] = useState('wav')
  const [mp3Bitrate, setMp3Bitrate] = useState(192)
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null)
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (convertedUrl) URL.revokeObjectURL(convertedUrl)
    setFile(null); setAudioBuffer(null); setPreviewUrl(null); setSourceKind(null)
    setConvertedBlob(null); setConvertedUrl(null); setShowPreview(false); setError(null)
  }, [previewUrl, convertedUrl])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); if (convertedUrl) URL.revokeObjectURL(convertedUrl) }, [])

  const handleFile = useCallback(async (f: File) => {
    if (!isAudioLikeFile(f)) { setError('Unsupported file.'); return }
    setError(null); setConvertedBlob(null); setConvertedUrl(null); setFile(f)
    try {
      const { audioBuffer: buf } = await decodeAudioFile(f)
      setAudioBuffer(buf)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(f))
      setSourceKind(/\.(mp4|m4v|mov|m4a)$/i.test(f.name) ? 'mp4' : 'audio')
    } catch { setError('Could not decode this file.') }
  }, [previewUrl])

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }, [handleFile])

  const handleConvert = async () => {
    if (!audioBuffer) return; setIsConverting(true); setError(null)
    try {
      const blob = targetFormat === 'wav' ? encodeWAV(audioBuffer) : await encodeMP3(audioBuffer, mp3Bitrate)
      if (convertedUrl) URL.revokeObjectURL(convertedUrl)
      const url = URL.createObjectURL(blob); setConvertedBlob(blob); setConvertedUrl(url); setShowPreview(true)
    } catch (err: any) { setError('Conversion failed: ' + err.message) } finally { setIsConverting(false) }
  }

  const handleDownload = () => {
    if (!convertedBlob) return
    const ext = targetFormat === 'wav' ? '.wav' : '.mp3'
    const a = document.createElement('a'); a.href = convertedUrl!; a.download = getFileNameWithoutExt(file?.name || 'audio') + ext; a.click()
  }

  if (convertedBlob) {
    const ext = targetFormat.toUpperCase()
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong rounded-3xl p-10 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10 text-green-400" /></div>
          <h2 className="text-3xl font-black text-white tracking-tight mb-2">Converted</h2>
          <p className="text-[#71717a] mb-1">{file?.name} → {ext}</p>
          {sourceKind === 'mp4' && <p className="text-xs text-[#22d3ee] uppercase tracking-widest mt-2 flex items-center justify-center gap-2"><Sparkles className="w-3 h-3" /> Audio extracted from video</p>}
          {showPreview && <div className="my-6"><audio src={convertedUrl!} controls className="w-full rounded-xl" /></div>}
          <button onClick={handleDownload} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f59e0b] text-black font-black text-sm uppercase tracking-widest inline-flex items-center gap-2"><Download className="w-5 h-5" /> Download {ext}</button>
          <button onClick={reset} className="block mx-auto mt-4 text-sm text-[#71717a] hover:text-white transition-colors">Convert Another</button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-[rgba(212,175,55,0.1)] flex items-center justify-center"><AudioWaveform className="w-6 h-6 text-[#d4af37]" /></div>
          <div><h2 className="text-2xl font-black text-white tracking-tight">ConvertIT</h2><p className="text-sm text-[#71717a]">Audio & MP4 → WAV / MP3</p></div>
        </div>
        <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all mt-6 ${isDragging ? 'border-[#d4af37] bg-[rgba(212,175,55,0.05)]' : 'border-[rgba(255,255,255,0.06)] hover:border-[rgba(212,175,55,0.3)]'}`}>
          <input ref={fileInputRef} type="file" accept="audio/*,video/mp4,.mp3,.wav,.m4a,.flac,.ogg,.mp4" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-[rgba(212,175,55,0.1)]">
                {sourceKind === 'mp4' ? <Film className="w-7 h-7 text-[#22d3ee]" /> : <AudioWaveform className="w-7 h-7 text-[#d4af37]" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-white font-semibold truncate">{file.name}</p>
                <p className="text-xs text-[#71717a] mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB{audioBuffer && <> • {formatTime(audioBuffer.duration)}</>}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); reset() }} className="p-2 rounded-lg hover:bg-white/5 text-[#71717a]"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div><Upload className="w-10 h-10 mx-auto mb-3 text-[#3f3f46]" /><p className="text-white font-semibold">Drop audio here</p><p className="text-sm text-[#71717a] mt-1">MP3, WAV, M4A, OGG, FLAC, MP4</p></div>
          )}
        </div>
        {audioBuffer && (
          <div className="mt-6 space-y-5">
            <audio src={previewUrl!} controls className="w-full rounded-xl" />
            <div>
              <label className="text-xs font-bold text-[#71717a] uppercase tracking-widest mb-2 block">Output Format</label>
              <div className="grid grid-cols-2 gap-3">
                {OUTPUT_FORMATS.map(fmt => (
                  <button key={fmt.value} onClick={() => setTargetFormat(fmt.value)} className={`flex items-center gap-3 p-4 rounded-xl text-left transition-all ${targetFormat === fmt.value ? 'bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.5)] text-white' : 'bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] text-[#71717a] hover:text-white'}`}>
                    <FileAudio className={`w-6 h-6 ${targetFormat === fmt.value ? 'text-[#d4af37]' : ''}`} />
                    <div><div className="font-bold text-base">{fmt.label}</div><div className="text-xs opacity-70">{fmt.sub}</div></div>
                  </button>
                ))}
              </div>
            </div>
            {targetFormat === 'mp3' && (
              <div>
                <label className="text-xs font-bold text-[#71717a] uppercase tracking-widest mb-2 block">Bitrate</label>
                <div className="grid grid-cols-4 gap-2">{MP3_BITRATES.map(br => (
                  <button key={br} onClick={() => setMp3Bitrate(br)} className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${mp3Bitrate === br ? 'bg-[#d4af37] text-black' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white'}`}>{br}k</button>
                ))}</div>
              </div>
            )}
            <button onClick={handleConvert} disabled={isConverting} className="w-full py-4 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#f59e0b] text-black font-black text-sm uppercase tracking-widest inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {isConverting ? <><Loader2 className="w-4 h-4 animate-spin" /> Converting...</> : <><Download className="w-4 h-4" /> Convert & Download</>}
            </button>
          </div>
        )}
        <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">{error}</p></motion.div>}</AnimatePresence>
      </motion.div>
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Upload, Download, Image, ArrowLeft, Loader2, AlertCircle, CheckCircle2, RotateCcw, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { imageToICO, loadImageFromFile, previewImage } from '../../engines/image'

const ICO_SIZES = [16, 32, 48, 64, 128, 256]

export default function ImageToICO({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate()
  const goBack = onBack || (() => navigate('/'))
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const [selectedSizes, setSelectedSizes] = useState([16, 32, 48, 64, 128, 256])
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [icoUrl, setIcoUrl] = useState<string | null>(null)
  const [icoBlob, setIcoBlob] = useState<Blob | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('image/')) { setError('Please select an image file.'); return }
    setError(null); setIcoUrl(null); setIcoBlob(null); setFile(f)
    try { const dataUrl = await previewImage(f); setPreview(dataUrl); const img = await loadImageFromFile(f); setImageElement(img); setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight }) }
    catch { setError('Could not load image.'); console.error }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }, [handleFile])
  const toggleSize = (size: number) => setSelectedSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size].sort((a, b) => a - b))

  const handleConvert = async () => {
    if (!imageElement || selectedSizes.length === 0) return; setIsConverting(true); setError(null)
    try { const blob = imageToICO(imageElement, selectedSizes); if (icoUrl) URL.revokeObjectURL(icoUrl); setIcoUrl(URL.createObjectURL(blob)); setIcoBlob(blob) }
    catch (err: any) { setError('Conversion failed: ' + err.message) } finally { setIsConverting(false) }
  }

  const handleDownload = () => { if (!icoBlob) return; const a = document.createElement('a'); a.href = icoUrl!; a.download = (file?.name.replace(/\.[^/.]+$/, '') || 'icon') + '.ico'; a.click() }

  if (icoUrl) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong rounded-3xl p-10 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10 text-green-400" /></div>
        <h2 className="text-3xl font-black text-white tracking-tight mb-2">ICO Generated</h2>
        <p className="text-[#71717a] mb-2">{selectedSizes.length} sizes embedded</p>
        <p className="text-xs text-[#3f3f46] mb-6">{selectedSizes.map(s => s + 'px').join(', ')}</p>
        <div className="flex items-center justify-center gap-6 mb-8">{selectedSizes.slice(0, 4).map(size => <div key={size} className="text-center"><img src={icoUrl} alt="" style={{ width: Math.min(size, 64), height: Math.min(size, 64) }} className="rounded-lg border border-[rgba(255,255,255,0.06)]" /><p className="text-xs text-[#71717a] mt-1">{size}px</p></div>)}</div>
        <button onClick={handleDownload} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#f43f5e] to-[#d4af37] text-white font-black text-sm uppercase tracking-widest inline-flex items-center gap-2"><Download className="w-5 h-5" /> Download .ICO</button>
        <button onClick={() => { setIcoUrl(null); setIcoBlob(null) }} className="block mx-auto mt-4 text-sm text-[#71717a] hover:text-white transition-colors">Convert Another</button>
      </motion.div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={goBack} className="flex items-center gap-2 text-[#71717a] hover:text-white mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-8"><div className="w-12 h-12 rounded-xl bg-[rgba(244,63,94,0.1)] flex items-center justify-center"><Image className="w-6 h-6 text-[#f43f5e]" /></div><div><h2 className="text-2xl font-black text-white tracking-tight">Image to ICO</h2><p className="text-sm text-[#71717a]">Multi-resolution ICO generator</p></div></div>
        {!preview ? (
          <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${isDragging ? 'border-[#f43f5e] bg-[rgba(244,63,94,0.05)]' : 'border-[rgba(255,255,255,0.06)] hover:border-[rgba(244,63,94,0.3)]'}`}>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Upload className="w-10 h-10 mx-auto mb-4 text-[#3f3f46]" /><p className="text-white font-semibold">Drop image here</p><p className="text-sm text-[#71717a] mt-1">PNG, JPG, WebP, SVG</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] flex items-center justify-center"><img src={preview} alt="Preview" className="max-w-full max-h-full object-contain" /></div>
              <div className="flex-1"><p className="text-white font-semibold">{file?.name}</p>{imageDimensions && <p className="text-sm text-[#71717a]">{imageDimensions.width} × {imageDimensions.height}px</p>}</div>
              <button onClick={() => { setPreview(null); setImageElement(null); setFile(null); setImageDimensions(null) }} className="p-2 rounded-lg hover:bg-white/5 text-[#71717a]"><RotateCcw className="w-4 h-4" /></button>
            </div>
            <div><label className="text-xs font-bold text-[#71717a] uppercase tracking-widest mb-3 block">Include Sizes</label><div className="grid grid-cols-3 gap-2">{ICO_SIZES.map(size => <button key={size} onClick={() => toggleSize(size)} className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${selectedSizes.includes(size) ? 'bg-[#f43f5e] text-white' : 'bg-[rgba(255,255,255,0.03)] text-[#71717a] hover:text-white'}`}>{size}px</button>)}</div></div>
            <div className="p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2 mb-2"><Eye className="w-4 h-4 text-[#71717a]" /><span className="text-xs font-bold text-[#71717a] uppercase tracking-widest">Preview</span></div>
              <div className="flex items-end gap-4">{selectedSizes.slice(0, 5).map(size => <div key={size} className="text-center"><img src={preview!} alt="" style={{ width: Math.min(size, 64), height: Math.min(size, 64) }} className="rounded border border-[rgba(255,255,255,0.06)]" /><p className="text-[10px] text-[#3f3f46] mt-1">{size}px</p></div>)}</div>
            </div>
            <button onClick={handleConvert} disabled={isConverting || selectedSizes.length === 0} className="w-full py-4 rounded-xl bg-gradient-to-r from-[#f43f5e] to-[#d4af37] text-white font-black text-sm uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {isConverting ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Download className="w-4 h-4" /> Generate ICO</>}
            </button>
          </div>
        )}
        {error && <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">{error}</p></div>}
      </motion.div>
    </div>
  )
}

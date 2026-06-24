export async function decodeAudioFile(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  return { audioBuffer, audioContext }
}

export function isAudioLikeFile(file: File | null): boolean {
  if (!file) return false
  const t = (file.type || '').toLowerCase()
  if (t.startsWith('audio/')) return true
  if (t === 'video/mp4' || t === 'video/quicktime' || t === 'video/webm' || t === 'video/x-m4a') return true
  if (/\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|wma|aiff|mp4|m4v|mov)$/i.test(file.name || '')) return true
  return false
}

export function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const format = 1
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const data: number[] = []

  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = audioBuffer.getChannelData(channel)[i]
      const intSample = Math.max(-1, Math.min(1, sample))
      data.push(intSample < 0 ? intSample * 0x8000 : intSample * 0x7FFF)
    }
  }

  const dataLength = data.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < data.length; i++) {
    view.setInt16(offset, data[i], true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export async function encodeMP3(audioBuffer: AudioBuffer, bitrate = 192) {
  const lamejs = await import('lamejs')
  const { Mp3Encoder } = lamejs
  const channels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate)
  const left = audioBuffer.getChannelData(0)
  const right = channels > 1 ? audioBuffer.getChannelData(1) : left
  const leftInt16 = floatTo16BitPCM(left)
  const rightInt16 = floatTo16BitPCM(right)
  const mp3Data: Uint8Array[] = []
  const sampleBlockSize = 1152
  for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
    const leftChunk = leftInt16.subarray(i, i + sampleBlockSize)
    const rightChunk = rightInt16.subarray(i, i + sampleBlockSize)
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk)
    if (mp3buf.length > 0) mp3Data.push(mp3buf)
  }
  const end = encoder.flush()
  if (end.length > 0) mp3Data.push(end)
  return new Blob(mp3Data, { type: 'audio/mp3' })
}

function floatTo16BitPCM(float32Array: Float32Array) {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return int16Array
}

export function cloneAudioBuffer(audioBuffer: AudioBuffer): AudioBuffer {
  const newBuffer = new AudioBuffer({
    length: audioBuffer.length,
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
  })
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    newBuffer.getChannelData(ch).set(audioBuffer.getChannelData(ch))
  }
  return newBuffer
}

export function trimAudioBuffer(audioBuffer: AudioBuffer, startTime: number, endTime: number): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.min(Math.floor(endTime * sampleRate), audioBuffer.length)
  const newLength = Math.max(1, endSample - startSample)
  const newBuffer = new AudioBuffer({ length: newLength, numberOfChannels: audioBuffer.numberOfChannels, sampleRate })
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const oldData = audioBuffer.getChannelData(ch)
    const newData = newBuffer.getChannelData(ch)
    const copyLen = Math.min(newLength, audioBuffer.length - startSample)
    for (let i = 0; i < copyLen; i++) newData[i] = oldData[startSample + i]
  }
  return newBuffer
}

export function cutAudioBuffer(audioBuffer: AudioBuffer, cutStartTime: number, cutEndTime: number): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate
  const cutStartSample = Math.max(0, Math.floor(cutStartTime * sampleRate))
  const cutEndSample = Math.min(audioBuffer.length, Math.floor(cutEndTime * sampleRate))
  const cutLen = Math.max(0, cutEndSample - cutStartSample)
  const newLength = Math.max(1, audioBuffer.length - cutLen)
  const newBuffer = new AudioBuffer({ length: newLength, numberOfChannels: audioBuffer.numberOfChannels, sampleRate })
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const oldData = audioBuffer.getChannelData(ch)
    const newData = newBuffer.getChannelData(ch)
    let writeIdx = 0
    for (let i = 0; i < audioBuffer.length; i++) {
      if (i >= cutStartSample && i < cutEndSample) continue
      newData[writeIdx++] = oldData[i]
    }
  }
  return newBuffer
}

export function reverseAudioBuffer(audioBuffer: AudioBuffer): AudioBuffer {
  const newBuffer = new AudioBuffer({ length: audioBuffer.length, numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate })
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const oldData = audioBuffer.getChannelData(ch)
    const newData = newBuffer.getChannelData(ch)
    for (let i = 0; i < audioBuffer.length; i++) newData[i] = oldData[audioBuffer.length - 1 - i]
  }
  return newBuffer
}

export function applyFadeIn(audioBuffer: AudioBuffer, fadeSeconds: number): AudioBuffer {
  const newBuffer = cloneAudioBuffer(audioBuffer)
  const fadeSamples = Math.max(1, Math.min(audioBuffer.length, Math.floor(fadeSeconds * audioBuffer.sampleRate)))
  for (let ch = 0; ch < newBuffer.numberOfChannels; ch++) {
    const data = newBuffer.getChannelData(ch)
    for (let i = 0; i < fadeSamples; i++) data[i] *= i / fadeSamples
  }
  return newBuffer
}

export function applyFadeOut(audioBuffer: AudioBuffer, fadeSeconds: number): AudioBuffer {
  const newBuffer = cloneAudioBuffer(audioBuffer)
  const fadeSamples = Math.max(1, Math.min(audioBuffer.length, Math.floor(fadeSeconds * audioBuffer.sampleRate)))
  const start = audioBuffer.length - fadeSamples
  for (let ch = 0; ch < newBuffer.numberOfChannels; ch++) {
    const data = newBuffer.getChannelData(ch)
    for (let i = 0; i < fadeSamples; i++) data[start + i] *= 1 - i / fadeSamples
  }
  return newBuffer
}

export function computeWaveform(audioBuffer: AudioBuffer, samples = 800): { min: number; max: number }[] {
  const channelData = audioBuffer.getChannelData(0)
  const blockSize = Math.max(1, Math.floor(channelData.length / samples))
  const points: { min: number; max: number }[] = []
  for (let i = 0; i < samples; i++) {
    const start = i * blockSize
    let min = 1.0, max = -1.0
    for (let j = 0; j < blockSize && start + j < channelData.length; j++) {
      const sample = channelData[start + j]
      if (sample < min) min = sample
      if (sample > max) max = sample
    }
    points.push({ min, max })
  }
  return points
}

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const neg = seconds < 0
  const s = Math.abs(seconds)
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  const ms = Math.floor((s - Math.floor(s)) * 100)
  return `${neg ? '-' : ''}${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

export function getFileNameWithoutExt(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

export async function renderFxChain(audioBuffer: AudioBuffer, chain: { apply: Function; params: Record<string, number> }[]) {
  const active = chain.filter(n => n)
  if (active.length === 0) return audioBuffer
  let working = audioBuffer
  for (const node of active) {
    if (typeof node.apply === 'function') {
      working = await node.apply(working, node.params || {})
    }
  }
  return working
}

export interface FxParamDef {
  id: string
  label: string
  min: number
  max: number
  step: number
  unit: string
  default: number
  scale?: 'log'
}

export interface FxDef {
  id: string
  label: string
  category: string
  defaults: Record<string, number>
  params: FxParamDef[]
}

export const FX_DEFS: Record<string, FxDef> = {
  gain: { id: 'gain', label: 'Gain', category: 'Dynamics', defaults: { gainDb: 0 }, params: [{ id: 'gainDb', label: 'Gain', min: -24, max: 24, step: 0.5, unit: 'dB', default: 0 }] },
  compressor: { id: 'compressor', label: 'Compressor', category: 'Dynamics', defaults: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, makeupDb: 0 }, params: [{ id: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, unit: 'dB', default: -24 }, { id: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1', default: 4 }, { id: 'attack', label: 'Attack', min: 0, max: 1, step: 0.001, unit: 's', default: 0.003 }, { id: 'release', label: 'Release', min: 0.01, max: 2, step: 0.01, unit: 's', default: 0.25 }, { id: 'makeupDb', label: 'Makeup', min: 0, max: 24, step: 0.5, unit: 'dB', default: 0 }] },
  eq: { id: 'eq', label: '3-Band EQ', category: 'Filter', defaults: { low: 0, mid: 0, high: 0, midFreq: 1000 }, params: [{ id: 'low', label: 'Low Shelf', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 }, { id: 'mid', label: 'Mid', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 }, { id: 'high', label: 'High Shelf', min: -18, max: 18, step: 0.5, unit: 'dB', default: 0 }, { id: 'midFreq', label: 'Mid Freq', min: 200, max: 5000, step: 50, unit: 'Hz', default: 1000 }] },
  lowpass: { id: 'lowpass', label: 'Low-Pass', category: 'Filter', defaults: { freq: 8000, q: 0.7 }, params: [{ id: 'freq', label: 'Cutoff', min: 60, max: 20000, step: 50, unit: 'Hz', default: 8000, scale: 'log' }, { id: 'q', label: 'Resonance', min: 0.1, max: 20, step: 0.1, unit: 'Q', default: 0.7 }] },
  highpass: { id: 'highpass', label: 'High-Pass', category: 'Filter', defaults: { freq: 80, q: 0.7 }, params: [{ id: 'freq', label: 'Cutoff', min: 20, max: 2000, step: 10, unit: 'Hz', default: 80, scale: 'log' }, { id: 'q', label: 'Resonance', min: 0.1, max: 20, step: 0.1, unit: 'Q', default: 0.7 }] },
  delay: { id: 'delay', label: 'Delay', category: 'Time', defaults: { time: 0.3, feedback: 0.35, mix: 0.3 }, params: [{ id: 'time', label: 'Time', min: 0.01, max: 2, step: 0.01, unit: 's', default: 0.3 }, { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, step: 0.01, unit: '', default: 0.35 }, { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '', default: 0.3 }] },
  reverb: { id: 'reverb', label: 'Reverb', category: 'Space', defaults: { size: 0.5, decay: 2.5, mix: 0.3, damping: 0.5 }, params: [{ id: 'size', label: 'Size', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 }, { id: 'decay', label: 'Decay', min: 0.1, max: 10, step: 0.1, unit: 's', default: 2.5 }, { id: 'damping', label: 'Damping', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 }, { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '', default: 0.3 }] },
  chorus: { id: 'chorus', label: 'Chorus', category: 'Modulation', defaults: { rate: 1.5, depth: 0.005, mix: 0.4 }, params: [{ id: 'rate', label: 'Rate', min: 0.1, max: 8, step: 0.1, unit: 'Hz', default: 1.5 }, { id: 'depth', label: 'Depth', min: 0, max: 0.02, step: 0.0005, unit: 's', default: 0.005 }, { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '', default: 0.4 }] },
  distortion: { id: 'distortion', label: 'Distortion', category: 'Distortion', defaults: { drive: 25, mix: 0.5 }, params: [{ id: 'drive', label: 'Drive', min: 0, max: 100, step: 1, unit: '', default: 25 }, { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 }] },
  normalize: { id: 'normalize', label: 'Normalize', category: 'Utility', defaults: { targetDb: -1 }, params: [{ id: 'targetDb', label: 'Target', min: -24, max: 0, step: 0.1, unit: 'dB', default: -1 }] },
}

export const FX_CATEGORIES = ['Dynamics', 'Filter', 'Time', 'Space', 'Modulation', 'Distortion', 'Utility']

export const FX_PRESETS = [
  { id: 'clean', label: 'Clean', chain: [] as { type: string; params: Record<string, number> }[] },
  { id: 'loud-master', label: 'Loud Master', chain: [{ type: 'eq', params: { low: 2, mid: -1, high: 3, midFreq: 1000 } }, { type: 'compressor', params: { threshold: -18, ratio: 3, attack: 0.005, release: 0.2, makeupDb: 4 } }, { type: 'normalize', params: { targetDb: -0.5 } }] },
  { id: 'warm-vinyl', label: 'Warm Vinyl', chain: [{ type: 'eq', params: { low: 4, mid: 1, high: -3, midFreq: 800 } }, { type: 'lowpass', params: { freq: 9000, q: 0.8 } }, { type: 'reverb', params: { size: 0.3, decay: 1.2, mix: 0.15, damping: 0.7 } }] },
  { id: 'telephone', label: 'Telephone', chain: [{ type: 'highpass', params: { freq: 400, q: 0.9 } }, { type: 'lowpass', params: { freq: 3200, q: 0.9 } }, { type: 'compressor', params: { threshold: -22, ratio: 5, attack: 0.001, release: 0.1, makeupDb: 6 } }] },
  { id: 'huge-echo', label: 'Huge Echo', chain: [{ type: 'delay', params: { time: 0.45, feedback: 0.55, mix: 0.5 } }, { type: 'reverb', params: { size: 0.7, decay: 4, mix: 0.4, damping: 0.4 } }] },
  { id: 'lo-fi', label: 'Lo-Fi', chain: [{ type: 'eq', params: { low: 3, mid: -4, high: -6, midFreq: 1000 } }, { type: 'distortion', params: { drive: 35, mix: 0.4 } }, { type: 'highpass', params: { freq: 120, q: 0.7 } }] },
  { id: 'shimmer-pad', label: 'Shimmer Pad', chain: [{ type: 'chorus', params: { rate: 0.6, depth: 0.008, mix: 0.5 } }, { type: 'reverb', params: { size: 0.9, decay: 6, mix: 0.55, damping: 0.3 } }] },
  { id: 'punch', label: 'Punch', chain: [{ type: 'compressor', params: { threshold: -14, ratio: 6, attack: 0.001, release: 0.08, makeupDb: 3 } }, { type: 'eq', params: { low: 2, mid: 0, high: 1.5, midFreq: 1500 } }] },
]

async function processViaOffline(buffers: AudioBuffer[], builder: (ctx: OfflineAudioContext, sources: AudioBufferSourceNode[]) => AudioNode) {
  if (!buffers || buffers.length === 0) return null
  const first = buffers[0]
  const channels = first.numberOfChannels
  const sampleRate = first.sampleRate
  const length = first.length
  const offline = new OfflineAudioContext(channels, length, sampleRate)
  const sources = buffers.map(buf => {
    const s = offline.createBufferSource()
    s.buffer = buf
    return s
  })
  const last = builder(offline, sources)
  if (last) last.connect(offline.destination)
  sources.forEach(s => s.start())
  return await offline.startRendering()
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

export const FX_APPLIERS: Record<string, (buf: AudioBuffer, p: Record<string, number>) => Promise<AudioBuffer>> = {
  gain: async (buf, p) => {
    const out = cloneAudioBuffer(buf)
    const g = dbToGain(p.gainDb ?? 0)
    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const d = out.getChannelData(ch)
      for (let i = 0; i < d.length; i++) d[i] *= g
    }
    return out
  },
  compressor: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = p.threshold ?? -24
    comp.knee.value = 6
    comp.ratio.value = p.ratio ?? 4
    comp.attack.value = p.attack ?? 0.003
    comp.release.value = p.release ?? 0.25
    const makeup = ctx.createGain()
    makeup.gain.value = dbToGain(p.makeupDb ?? 0)
    src.connect(comp)
    comp.connect(makeup)
    return makeup
  }) as Promise<AudioBuffer>,
  eq: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = p.low ?? 0
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = p.midFreq ?? 1000; mid.Q.value = 1; mid.gain.value = p.mid ?? 0
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = p.high ?? 0
    src.connect(low); low.connect(mid); mid.connect(high)
    return high
  }) as Promise<AudioBuffer>,
  lowpass: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.freq ?? 8000; f.Q.value = p.q ?? 0.7
    src.connect(f); return f
  }) as Promise<AudioBuffer>,
  highpass: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = p.freq ?? 80; f.Q.value = p.q ?? 0.7
    src.connect(f); return f
  }) as Promise<AudioBuffer>,
  normalize: async (buf, p) => {
    const out = cloneAudioBuffer(buf)
    let peak = 0
    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const d = out.getChannelData(ch)
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a }
    }
    if (peak <= 0) return out
    const target = dbToGain(p.targetDb ?? -1)
    const g = target / peak
    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const d = out.getChannelData(ch)
      for (let i = 0; i < d.length; i++) d[i] *= g
    }
    return out
  },
  distortion: async (buf, p) => {
    const drive = p.drive ?? 25; const mix = p.mix ?? 0.5
    const out = cloneAudioBuffer(buf); const k = drive
    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const d = out.getChannelData(ch)
      for (let i = 0; i < d.length; i++) { const dry = d[i]; d[i] = dry * (1 - mix) + ((1 + k) * dry) / (1 + k * Math.abs(dry)) * mix }
    }
    return out
  },
  delay: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const time = p.time ?? 0.3; const feedback = p.feedback ?? 0.35; const mix = p.mix ?? 0.3
    const dry = ctx.createGain(); dry.gain.value = 1 - mix
    const wet = ctx.createGain(); wet.gain.value = mix
    const delay = ctx.createDelay(2.0); delay.delayTime.value = time
    const fb = ctx.createGain(); fb.gain.value = feedback
    const out = ctx.createGain()
    src.connect(dry); dry.connect(out)
    src.connect(delay); delay.connect(wet); wet.connect(out)
    delay.connect(fb); fb.connect(delay)
    return out
  }) as Promise<AudioBuffer>,
  reverb: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const size = p.size ?? 0.5; const decay = p.decay ?? 2.5; const mix = p.mix ?? 0.3; const damping = p.damping ?? 0.5
    const dry = ctx.createGain(); dry.gain.value = 1 - mix
    const wet = ctx.createGain(); wet.gain.value = mix
    const out = ctx.createGain()
    const conv = ctx.createConvolver()
    conv.buffer = makeImpulse(ctx, decay, damping, size)
    src.connect(dry); dry.connect(out)
    src.connect(conv); conv.connect(wet); wet.connect(out)
    return out
  }) as Promise<AudioBuffer>,
  chorus: async (buf, p) => processViaOffline([buf], (ctx, [src]) => {
    const rate = p.rate ?? 1.5; const depth = p.depth ?? 0.005; const mix = p.mix ?? 0.4
    const dry = ctx.createGain(); dry.gain.value = 1 - mix
    const wet = ctx.createGain(); wet.gain.value = mix
    const out = ctx.createGain()
    const delay = ctx.createDelay(0.05); delay.delayTime.value = 0.02
    const osc = ctx.createOscillator(); osc.frequency.value = rate
    const lfoGain = ctx.createGain(); lfoGain.gain.value = depth
    osc.connect(lfoGain); lfoGain.connect(delay.delayTime)
    src.connect(delay); delay.connect(wet); wet.connect(out)
    src.connect(dry); dry.connect(out)
    osc.start()
    return out
  }) as Promise<AudioBuffer>,
}

function makeImpulse(ctx: BaseAudioContext, duration: number, damping: number, size: number) {
  const rate = ctx.sampleRate
  const length = Math.max(1, Math.floor(rate * Math.max(0.05, Math.min(10, duration))))
  const impulse = ctx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / length
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1 + damping * 4) * (ch === 0 ? 1 : 0.85) * (0.5 + size * 0.5)
    }
  }
  return impulse
}

export function makeFxNode(type: string, paramsOverride?: Record<string, number>) {
  const def = FX_DEFS[type]
  if (!def) return null
  return { id: `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, type, params: { ...def.defaults, ...(paramsOverride || {}) }, enabled: true }
}

export function fxNodeFromPresetNode(p: { type: string; params: Record<string, number> }) {
  return { id: `${p.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, type: p.type, params: { ...(FX_DEFS[p.type]?.defaults || {}), ...(p.params || {}) }, enabled: true }
}

export function applyFxNode(node: { type: string; params: Record<string, number> }) {
  return { apply: FX_APPLIERS[node.type], params: node.params }
}

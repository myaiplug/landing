export function imageToICO(imageElement: HTMLImageElement, sizes = [16, 32, 48, 64, 128, 256]) {
  const canvases = sizes.map(size => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imageElement, 0, 0, size, size)
    return { canvas, size }
  })
  const pngBuffers = canvases.map(({ canvas }) => {
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.split(',')[1]
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  })
  return createICOFile(pngBuffers, sizes)
}

function createICOFile(pngBuffers: Uint8Array[], sizes: number[]) {
  const numImages = sizes.length
  const headerSize = 6
  const entrySize = 16
  const headerAndEntriesSize = headerSize + numImages * entrySize
  let dataOffset = headerAndEntriesSize
  const imageHeaders: { width: number; height: number; colorCount: number; reserved: number; planes: number; bitCount: number; bytesInRes: number; imageOffset: number }[] = []
  const imageData: Uint8Array[] = []
  for (let i = 0; i < numImages; i++) {
    const png = pngBuffers[i]
    const size = sizes[i]
    imageHeaders.push({ width: size >= 256 ? 0 : size, height: size >= 256 ? 0 : size, colorCount: 0, reserved: 0, planes: 1, bitCount: 32, bytesInRes: png.length, imageOffset: dataOffset })
    imageData.push(png)
    dataOffset += png.length
  }
  const totalSize = dataOffset
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, numImages, true)
  let offset = 6
  for (let i = 0; i < numImages; i++) {
    const h = imageHeaders[i]
    view.setUint8(offset, h.width); offset++
    view.setUint8(offset, h.height); offset++
    view.setUint8(offset, h.colorCount); offset++
    view.setUint8(offset, h.reserved); offset++
    view.setUint16(offset, h.planes, true); offset += 2
    view.setUint16(offset, h.bitCount, true); offset += 2
    view.setUint32(offset, h.bytesInRes, true); offset += 4
    view.setUint32(offset, h.imageOffset, true); offset += 4
  }
  const uint8 = new Uint8Array(buffer)
  for (let i = 0; i < numImages; i++) uint8.set(imageData[i], imageHeaders[i].imageOffset)
  return new Blob([uint8], { type: 'image/x-icon' })
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export function previewImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

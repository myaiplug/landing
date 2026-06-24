import { writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a5cff"/>
      <stop offset="1" stop-color="#58a6ff"/>
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="256" fill="url(#g)"/>
  <text x="256" y="290" text-anchor="middle" font-size="220" font-weight="800" font-family="system-ui,sans-serif" fill="white">M</text>
</svg>`

writeFileSync(join(publicDir, 'favicon.svg'), svg)
console.log('✓ favicon.svg created')

// For PNG icons, the build will use the PWA plugin's generatePwaAsset option
// or you can generate them at https://realfavicongenerator.net
// We'll use auto-generation via the PWA plugin

export interface SeoPageConfig {
  slug: string
  title: string
  h1: string
  h1Highlight: string
  description: string
  accentColor: string
  metaDescription: string
  visualFocus: 'vocals' | 'drums' | 'bass' | 'other' | 'all'
}

export const SEO_PAGES: SeoPageConfig[] = [
  {
    slug: 'vocal-remover',
    title: 'Vocal Remover — Extract Acapellas Free Online | MyAiPlug',
    h1: 'Remove vocals from',
    h1Highlight: 'any song.',
    description: 'Drop a track. Our AI separates vocals from instruments in seconds. No uploads, no signup — runs in your browser.',
    accentColor: '#22c55e',
    metaDescription: 'Free online vocal remover. AI-powered acapella extraction. Works in your browser — nothing leaves your machine.',
    visualFocus: 'vocals',
  },
  {
    slug: 'drum-extractor',
    title: 'Drum Extractor — Isolate Drums Free Online | MyAiPlug',
    h1: 'Isolate the',
    h1Highlight: 'drums.',
    description: 'Separate drums from any track with AI precision. Perfect for remixing, sampling, and practice.',
    accentColor: '#ff6b35',
    metaDescription: 'Free online drum extractor. AI stem separation for drums and percussion. Browser-based, private, instant.',
    visualFocus: 'drums',
  },
  {
    slug: 'karaoke-maker',
    title: 'Karaoke Maker — Remove Vocals Free Online | MyAiPlug',
    h1: 'Turn any song into',
    h1Highlight: 'karaoke.',
    description: 'Remove vocals and keep the music. AI-powered karaoke track generation in your browser.',
    accentColor: '#00f0ff',
    metaDescription: 'Free online karaoke maker. Remove vocals from any song instantly. Browser-based AI stem separation.',
    visualFocus: 'vocals',
  },
  {
    slug: 'bass-extractor',
    title: 'Bass Extractor — Isolate Bass Lines Free Online | MyAiPlug',
    h1: 'Extract the',
    h1Highlight: 'bassline.',
    description: 'Separate bass from any track. Learn lines, create covers, or sample with pristine isolation.',
    accentColor: '#a855f7',
    metaDescription: 'Free online bass extractor. AI stem separation for bass lines. Works in your browser.',
    visualFocus: 'bass',
  },
]

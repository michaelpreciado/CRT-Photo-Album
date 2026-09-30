// Render-quality tiers. Mobile starts at "medium"; the engine steps down a
// tier if the measured frame rate stays low, and `?quality=` pins a tier.
export type Tier = 'low' | 'medium' | 'high'

export interface QualitySettings {
  tier: Tier
  maxDpr: number
  msaa: number
  shadowMapSize: number
  pcssSamples: number // 0 = plain PCF soft shadows
  reflectionScale: number // planar reflection resolution relative to the canvas
  reflectionEvery: number // re-render the reflection every N frames
  bakeSize: number // procedural texture resolution
  bloomScale: number
  dust: number
}

export const TIERS: Record<Tier, QualitySettings> = {
  high: { tier: 'high', maxDpr: 2, msaa: 4, shadowMapSize: 2048, pcssSamples: 20, reflectionScale: 0.5, reflectionEvery: 1, bakeSize: 2048, bloomScale: 0.5, dust: 900 },
  medium: { tier: 'medium', maxDpr: 1.6, msaa: 2, shadowMapSize: 1536, pcssSamples: 12, reflectionScale: 0.38, reflectionEvery: 1, bakeSize: 1024, bloomScale: 0.5, dust: 500 },
  low: { tier: 'low', maxDpr: 1.15, msaa: 0, shadowMapSize: 1024, pcssSamples: 0, reflectionScale: 0.28, reflectionEvery: 2, bakeSize: 1024, bloomScale: 0.35, dust: 250 },
}

export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export function initialTier(): Tier {
  const q = new URLSearchParams(location.search).get('quality')
  if (q === 'low' || q === 'medium' || q === 'high') return q
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (mem !== undefined && mem <= 2) return 'low'
  return isTouch || Math.min(screen.width, screen.height) < 700 ? 'medium' : 'high'
}

export const pinnedTier = () => new URLSearchParams(location.search).has('quality')

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

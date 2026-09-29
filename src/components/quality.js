import { createContext, useContext } from 'react'

/**
 * Adaptive quality tiers. `SceneCanvas` owns the current tier (driven by
 * drei's PerformanceMonitor) and provides it here; components read what they
 * need. Append `?quality=low|medium|high` to the URL to pin a tier.
 */
export const TIERS = [
  { name: 'low', dpr: 0.85, rtt: [768, 646], samples: 0, shadows: false, shadowMap: 512, dust: 0, glow: 0, env: false },
  { name: 'medium', dpr: 1.25, rtt: [1024, 862], samples: 2, shadows: true, shadowMap: 512, dust: 60, glow: 0.4, env: true },
  { name: 'high', dpr: 1.75, rtt: [1216, 1024], samples: 4, shadows: true, shadowMap: 1024, dust: 110, glow: 0.55, env: true },
]

export const QualityContext = createContext({ tier: TIERS[2], reduced: false })
export const useQuality = () => useContext(QualityContext)

export function initialTierIndex() {
  const param = new URLSearchParams(window.location.search).get('quality')
  const named = TIERS.findIndex((t) => t.name === param)
  if (named >= 0) return { index: named, locked: true }
  const small = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768
  return { index: small ? 1 : 2, locked: false }
}

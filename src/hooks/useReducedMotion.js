import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(cb) {
  const mq = window.matchMedia?.(QUERY)
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}

const get = () => !!window.matchMedia?.(QUERY).matches

/** Live `prefers-reduced-motion` value. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, get, () => false)
}

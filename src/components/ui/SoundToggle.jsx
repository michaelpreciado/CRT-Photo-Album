import { useSyncExternalStore } from 'react'
import { isSoundOn, setSoundOn, subscribeSound } from '../../utils/sound'

/** Sound is muted by default; the choice is remembered. */
export default function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => false)
  return (
    <button
      className="chip sound-toggle glass"
      aria-pressed={on}
      aria-label={on ? 'Mute sound' : 'Enable sound'}
      title={on ? 'Sound on' : 'Sound off'}
      onClick={() => setSoundOn(!on)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <>
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </>
        )}
      </svg>
      <span>{on ? 'SND ON' : 'SND OFF'}</span>
    </button>
  )
}

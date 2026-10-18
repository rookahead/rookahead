import type { ShareError } from '../lib/share'

interface Props {
  kind: 'shared' | ShareError
  onLoadGame: () => void
  onClose: () => void
}

const MESSAGES: Record<Props['kind'], string> = {
  shared: 'Shared review ·',
  damaged: 'This share link is incomplete or damaged',
  'newer-version': 'Refresh to open this link',
}

/** Shown above the panel after opening a share link: an invitation, or why the link didn't open. */
export function ShareBanner({ kind, onLoadGame, onClose }: Props) {
  return (
    <div className={`share-banner ${kind}`} role="status">
      <span>{MESSAGES[kind]}</span>
      {kind === 'shared' && (
        <button className="share-banner-action" onClick={onLoadGame}>
          Review your own games →
        </button>
      )}
      <button className="icon-btn share-banner-close" onClick={onClose} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z" />
        </svg>
      </button>
    </div>
  )
}

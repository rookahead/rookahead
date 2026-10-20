import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { hasUnsynced, logOut, useAccount } from '../lib/account'
import { navigate } from '../lib/router'
import { AvatarFace, Gear } from './UserCard'

interface Props {
  /** The button that opened it: the menu sits against it. */
  anchor: HTMLElement
  /** 'up' from the sidebar's foot, 'down' from the phone's header. */
  placement: 'up' | 'down'
  onClose: () => void
}

const LOG_OUT = 'M9 4H5v16h4M14 8l4 4-4 4M18 12H9'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
)

/** Who you're signed in as, with the ways to your profile, settings, and out. Drawn over the page,
 *  so the sidebar (which scrolls, and so clips) can't cut it off. */
export function AccountMenu({ anchor, placement, onClose }: Props) {
  const { account, username } = useAccount()
  const root = useRef<HTMLDivElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  // The button is already on screen (it was just clicked), so it can be measured here. A resize closes the menu.
  const r = anchor.getBoundingClientRect()
  const style: CSSProperties = placement === 'up' ? { left: r.left, bottom: window.innerHeight - r.top + 8 } : { right: window.innerWidth - r.right, top: r.bottom + 8 }

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!root.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  const go = (path: string) => {
    onClose()
    navigate(path)
  }
  const leave = async () => {
    setBusy(true)
    await logOut()
    onClose()
  }

  return createPortal(
    <div ref={root} className={`account-menu ${placement}`} style={style} role="menu" aria-label="Account">
      <div className="account-menu-who">
        <span className="user-avatar" aria-hidden>
          <AvatarFace account={account} />
        </span>
        <span className="account-menu-text">
          <strong>{username ?? account?.name}</strong>
          <span>{account?.email}</span>
        </span>
      </div>
      <button className="account-menu-item" role="menuitem" onClick={() => go('/settings/profile')}>
        {icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0')}
        Profile
      </button>
      <button className="account-menu-item" role="menuitem" onClick={() => go('/settings')}>
        <Gear />
        Settings
      </button>
      <div className="account-menu-sep" />
      {confirming ? (
        <div className="account-menu-confirm">
          <p>Some changes haven’t reached your account yet (you seem to be offline). Logging out now loses them.</p>
          <button className="account-menu-item danger" role="menuitem" disabled={busy} onClick={() => void leave()}>
            {icon(LOG_OUT)}
            {busy ? 'Logging out…' : 'Log out anyway'}
          </button>
        </div>
      ) : (
        <button className="account-menu-item" role="menuitem" disabled={busy} onClick={() => (hasUnsynced() ? setConfirming(true) : void leave())}>
          {icon(LOG_OUT)}
          {busy ? 'Logging out…' : 'Log out'}
        </button>
      )}
    </div>,
    document.body,
  )
}

import type { AnchorHTMLAttributes } from 'react'
import { navigate } from '../lib/router'

/** An in-app link: switches pages without reloading (new-tab clicks still work as usual). */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
    />
  )
}

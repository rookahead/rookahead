import { useEffect, useState } from 'react'

/** How long the coach takes over each letter of its line. */
const TYPE_MS = 24

/**
 * The coach's line, written out letter by letter from the left as if it were typing it to you (at once when motion
 * is reduced). The letters still to come keep their room, unseen, so the line never shifts as it's written. The
 * heading carries the whole line for screen readers.
 */
export function TypedLine({ text }: { text: string }) {
  const [shown, setShown] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? text.length : 0))
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(text.length)
    setShown(0)
    const timer = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(timer), n) : n + 1)), TYPE_MS)
    return () => clearInterval(timer)
  }, [text])
  return (
    <>
      <span aria-hidden>{text.slice(0, shown)}</span>
      <span className="typed-rest" aria-hidden>
        {text.slice(shown)}
      </span>
    </>
  )
}

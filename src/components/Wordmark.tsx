/** "rookahead": a heavy "rook" and a quieter "ahead", so the long name reads short. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`} aria-label="Rookahead">
      <span aria-hidden>rook</span>
      <span className="wordmark-tail" aria-hidden>
        ahead
      </span>
    </span>
  )
}

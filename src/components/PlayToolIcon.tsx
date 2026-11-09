// Play's game actions, drawn in lines like the move controls above them (index.css, .line-icon).
const TOOL_PATHS = {
  takeback: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  hint: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8v.3h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
  resign: 'M6 21V4m0 0h11l-2.5 4.5L17 13H6',
  abort: 'm6 6 12 12M18 6 6 18',
}

export function ToolIcon({ name }: { name: keyof typeof TOOL_PATHS }) {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <path d={TOOL_PATHS[name]} />
    </svg>
  )
}

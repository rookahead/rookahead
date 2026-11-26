import { useEffect, useState } from 'react'
import { Link } from '../../components/Link'
import { NavIcon } from '../../components/NavIcons'
import { fetchThemes } from '../../lib/puzzleData'
import { themeName } from '../../lib/puzzles'
import { THEME_GROUPS } from '../../lib/puzzleThemes'

const num = (n: number) => n.toLocaleString('en-US')

/** The counts, kept once fetched, so coming back shows them on the first frame. */
let counts: Record<string, number> | null = null

/**
 * Puzzle themes: every kind of puzzle, in groups (tactics, mates, deeper ideas, phases, goals), each a card with its
 * line and how many puzzles there are. A card opens puzzles of that kind near your rating (/puzzles/themes/fork).
 */
export function ThemesView() {
  const [shown, setShown] = useState(counts)
  useEffect(() => {
    if (counts) return
    fetchThemes().then(
      (index) => {
        counts = Object.fromEntries(Object.entries(index.themes).map(([k, v]) => [k, v.count]))
        setShown(counts)
      },
      () => {},
    )
  }, [])
  return (
    <main className="themes-page">
      <header className="themes-head">
        <Link to="/puzzles" className="icon-btn" aria-label="Back to Puzzles" title="Back to Puzzles">
          <NavIcon name="back" />
        </Link>
        <h1>Puzzle themes</h1>
      </header>
      <p className="themes-intro">Pick a kind of puzzle and practise just that, near your rating.</p>
      {THEME_GROUPS.map((group) => (
        <section key={group.name} className="themes-group" aria-labelledby={`themes-${group.name}`}>
          <h2 id={`themes-${group.name}`}>{group.name}</h2>
          <ul className="themes-grid">
            {group.themes.map(([key, line]) => (
              <li key={key}>
                <Link to={`/puzzles/themes/${key}`} className="home-card theme-card">
                  <strong>{themeName(key)}</strong>
                  <span>{line}</span>
                  {/* Its room is kept while the counts come, so nothing moves when they do. */}
                  <small>{shown?.[key] ? `${num(shown[key])} puzzles` : ' '}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}

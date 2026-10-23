import { describe, expect, it } from 'vitest'
import { PAGE_META, titleFor } from './pageMeta'

describe('titleFor', () => {
  it("gives each listed page its own title, with or without a trailing slash", () => {
    expect(titleFor('/play')).toBe(PAGE_META['/play'].title)
    expect(titleFor('/puzzles/daily/')).toBe(PAGE_META['/puzzles/daily'].title)
    expect(titleFor('/')).toBe(PAGE_META['/'].title)
  })

  it('names the pages search engines skip', () => {
    expect(titleFor('/puzzles/sprint')).toBe(PAGE_META['/puzzles'].title)
    expect(titleFor('/settings/board')).toBe('Settings · Rookahead')
    expect(titleFor('/analysis')).toBe('Game review · Rookahead')
    expect(titleFor('/login')).toBe('Sign in · Rookahead')
  })

  it('keeps every description short enough for a search result', () => {
    for (const meta of Object.values(PAGE_META)) expect(meta.description.length).toBeLessThanOrEqual(200)
  })
})

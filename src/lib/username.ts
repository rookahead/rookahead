// Username rules, the same as the database's check (supabase/schema.sql).

const RESERVED = new Set(['admin', 'administrator', 'rookahead', 'support', 'help', 'moderator', 'mod', 'staff', 'system', 'root', 'guest', 'anonymous', 'null', 'undefined', 'stockfish', 'computer', 'lichess', 'chesscom'])

/** What's wrong with a username, or null if it's fine (whether it's free is up to the server). */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return 'Use at least 3 characters.'
  if (name.length > 20) return 'Use at most 20 characters.'
  if (!/^[A-Za-z0-9]/.test(name)) return 'Start with a letter or a digit.'
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return 'Use only letters, digits, _ and -.'
  if (RESERVED.has(name.toLowerCase())) return 'That username is taken.'
  return null
}

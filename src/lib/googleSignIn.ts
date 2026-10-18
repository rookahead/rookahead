// Google sign-in done by the app itself (OpenID Connect, ID token in the fragment), so Google's
// screen says "continue to rookahead.com" rather than the Supabase project's address. The token
// then goes to Supabase (signInWithIdToken), which checks it against the raw nonce.

export function googleAuthUrl({ clientId, redirectUri, nonce, state }: { clientId: string; redirectUri: string; nonce: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export type GoogleReturn = { state: string; idToken: string } | { state: string; error: string }

/** What Google put in the fragment on its way back: a token, or why there isn't one. */
export function readGoogleReturn(hash: string): GoogleReturn | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const state = params.get('state') ?? ''
  const idToken = params.get('id_token')
  const error = params.get('error')
  if (idToken) return { state, idToken }
  if (error) return { state, error }
  return null
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

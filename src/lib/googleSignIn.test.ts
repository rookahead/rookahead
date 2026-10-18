import { describe, expect, it } from 'vitest'
import { googleAuthUrl, readGoogleReturn, sha256Hex } from './googleSignIn'

describe('googleAuthUrl', () => {
  it('asks Google for an ID token, sent back to our own page', () => {
    const url = new URL(googleAuthUrl({ clientId: 'abc.apps.googleusercontent.com', redirectUri: 'https://rookahead.com/auth/google', nonce: 'n1', state: 's1' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'abc.apps.googleusercontent.com',
      redirect_uri: 'https://rookahead.com/auth/google',
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: 'n1',
      state: 's1',
      prompt: 'select_account',
    })
  })
})

describe('readGoogleReturn', () => {
  it('reads the token and state from the fragment', () => {
    expect(readGoogleReturn('#state=s1&id_token=tok&authuser=0')).toEqual({ state: 's1', idToken: 'tok' })
  })

  it('reads a refusal', () => {
    expect(readGoogleReturn('#error=access_denied&state=s1')).toEqual({ state: 's1', error: 'access_denied' })
  })

  it('ignores anything else', () => {
    expect(readGoogleReturn('')).toBeNull()
    expect(readGoogleReturn('#foo=bar')).toBeNull()
  })
})

describe('sha256Hex', () => {
  it('hashes like everyone else', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

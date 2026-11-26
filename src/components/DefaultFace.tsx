import { useState } from 'react'

// A player's face when it isn't a photo: a chess piece on grey. You can choose yours (Settings → Profile, saved
// in place of a photo as "piece:<name>"); until you do, your username picks one of the first four, the same
// every time, so a list of players isn't a wall of the same face.
export const FACE_PIECES = {
  pawn: 'M12 3.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM9.6 11h4.8c-.1 2.7 1 4.6 3.1 5.8V20.6H6.5v-3.8c2.1-1.2 3.2-3.1 3.1-5.8z',
  knight:
    'M6 21H19.5C19.5 17 18.8 15 18.8 12.5C18.8 8.2 16.8 5.2 14 4.1L13.6 2.2L11.8 4C9.6 4.5 7.8 6 6.6 7.8L3.8 11.2C3.3 11.9 3.5 12.8 4.2 13.2L4.9 13.6C5.5 14 6.3 13.9 6.8 13.4L7.8 12.6C8.6 12.2 9.6 12.2 10.6 12.6C10.2 15.6 7 17.5 6 21Z',
  bishop:
    'M12 2.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 5.6c2.8 1.6 4.6 4 4.6 6.4 0 1.7-.9 2.9-2.1 3.5.2 1.4 1 2.4 2.6 2.9v2.2H6.9v-2.2c1.6-.5 2.4-1.5 2.6-2.9-1.2-.6-2.1-1.8-2.1-3.5 0-2.4 1.8-4.8 4.6-6.4zM13.6 8.2l-2.6 3.4.9.7 2.6-3.4z',
  rook: 'M5 3H8V5H10.5V3H13.5V5H16V3H19V11H15.5C15.5 15 16.5 17 19.5 18V21H4.5V18C7.5 17 8.5 15 8.5 11H5Z',
  queen:
    'M4.4 9.4L7.1 15.6L8.3 7.9L10.6 14.6L12 6.4L13.4 14.6L15.7 7.9L16.9 15.6L19.6 9.4L18 17.3H6ZM6 18.3H18V20.9H6ZM4 6.3a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7zM8.3 4.7a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7zM12 3.2a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7zM15.7 4.7a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7zM20 6.3a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z',
  king: 'M11 2.2h2v1.9h1.9v1.9H13v1.8h-2V6H9.1V4.1H11zM7.2 9.6C8.8 8.7 10.3 8.4 12 8.4S15.2 8.7 16.8 9.6C17.7 13 16.3 15.8 14.6 17.4H9.4C7.7 15.8 6.3 13 7.2 9.6ZM6 18.3H18V20.9H6Z',
}
export type FacePiece = keyof typeof FACE_PIECES
export const PIECE_NAMES = Object.keys(FACE_PIECES) as FacePiece[]

const PREFIX = 'piece:'
/** How a chosen piece is saved, in the photo's place. */
export const pieceUrl = (piece: FacePiece) => `${PREFIX}${piece}`

/** The piece a saved face is, or null for a photo (or nothing). */
export function chosenPiece(url: string | null | undefined): FacePiece | null {
  const p = url?.startsWith(PREFIX) ? url.slice(PREFIX.length) : null
  return p && p in FACE_PIECES ? (p as FacePiece) : null
}

/** Whether a saved face is an uploaded photo. */
export const isPhoto = (url: string | null | undefined): url is string => Boolean(url) && !url!.startsWith(PREFIX)

/** The piece a username gets until its owner chooses one: the same every time, whatever its case. */
export function namePiece(name: string): FacePiece {
  const h = [...name.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return PIECE_NAMES[(h >>> 3) % 4]
}

/** A piece on grey, filling its square (the avatar's box gives the corners). */
export function DefaultFace({ name, piece }: { name: string; piece?: FacePiece | null }) {
  return (
    <svg className="default-face" viewBox="0 0 24 24" aria-hidden>
      <path fillRule="evenodd" transform="translate(12 12) scale(0.66) translate(-12 -12)" d={FACE_PIECES[piece ?? namePiece(name)]} />
    </svg>
  )
}

/** Someone's face from what's saved for it: their photo, their chosen piece, or their name's piece. */
export function Face({ url, name }: { url: string | null | undefined; name: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  // crossOrigin: the page is cross-origin isolated, so images from other sites need CORS.
  if (isPhoto(url) && broken !== url) return <img src={url} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setBroken(url)} />
  return <DefaultFace name={name} piece={chosenPiece(url)} />
}

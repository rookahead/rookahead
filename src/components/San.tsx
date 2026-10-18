import { PieceIcon } from './PieceIcon'

const ROLE: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' }

/** SAN with a piece figurine instead of the letter: "Nxe5" → [knight]xe5. */
export function San({ san }: { san: string }) {
  const role = ROLE[san[0]]
  if (!role) return <>{san}</>
  return (
    <span className="san">
      <span className="figurine">
        <PieceIcon role={role} color="white" />
      </span>
      {san.slice(1)}
    </span>
  )
}

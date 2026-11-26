// The Puzzle themes page's list: Lichess's puzzle themes in groups, each said in a line. How many puzzles each has
// comes from public/puzzle-data/themes.json (scripts/build-puzzle-themes.mjs); a theme with none isn't shown.

export interface ThemeGroup {
  name: string
  themes: [key: string, line: string][]
}

export const THEME_GROUPS: ThemeGroup[] = [
  {
    name: 'Tactics',
    themes: [
      ['fork', 'One piece attacks two at once.'],
      ['pin', 'A piece can’t move without exposing a bigger one behind it.'],
      ['skewer', 'Attack a big piece; when it moves, take the one behind.'],
      ['discoveredAttack', 'Move one piece out of the way to unleash another.'],
      ['discoveredCheck', 'Move a piece to uncover a check from the one behind it.'],
      ['doubleCheck', 'Check with two pieces at once: the king has to move.'],
      ['hangingPiece', 'A piece left undefended. Take it.'],
      ['trappedPiece', 'A piece with nowhere safe to go.'],
      ['sacrifice', 'Give up material now for something better.'],
      ['deflection', 'Pull a defender away from what it guards.'],
      ['attraction', 'Lure a piece onto a square where it can be hit.'],
      ['capturingDefender', 'Take the piece that holds the position together.'],
      ['clearance', 'Clear a square or line for another piece.'],
      ['interference', 'Put a piece between an enemy piece and what it guards.'],
      ['intermezzo', 'An in-between move before the expected one.'],
      ['xRayAttack', 'A piece attacks or defends through another.'],
      ['exposedKing', 'Go after a king with too little cover.'],
      ['kingsideAttack', 'An attack on a king castled short.'],
      ['queensideAttack', 'An attack on a king castled long.'],
      ['attackingF2F7', 'Strike at f2 or f7, next to the king.'],
    ],
  },
  {
    name: 'Mates',
    themes: [
      ['mateIn1', 'Checkmate in one move.'],
      ['mateIn2', 'Checkmate in two moves.'],
      ['mateIn3', 'Checkmate in three moves.'],
      ['mateIn4', 'Checkmate in four moves.'],
      ['mateIn5', 'Checkmate in five or more.'],
      ['backRankMate', 'Mate on the back rank, the king hemmed in by its own pawns.'],
      ['smotheredMate', 'A knight mates a king boxed in by its own pieces.'],
      ['arabianMate', 'A rook and knight mate the king in a corner.'],
      ['anastasiaMate', 'A knight and rook or queen trap the king on the edge.'],
      ['bodenMate', 'Two bishops mate on crossing diagonals.'],
      ['doubleBishopMate', 'Two bishops side by side mate the king.'],
      ['dovetailMate', 'A queen mates a king whose escapes are blocked by its own pieces.'],
      ['hookMate', 'Rook, knight and pawn mate together.'],
      ['epauletteMate', 'A king stuck between its own pieces on either side.'],
      ['pillsburysMate', 'A rook and bishop mate a castled king.'],
      ['operaMate', 'A rook mates on the back rank, guarded by a bishop.'],
      ['morphysMate', 'A bishop mates a cornered king, helped by a rook.'],
      ['cornerMate', 'A rook or queen and a knight mate in the corner.'],
      ['killBoxMate', 'A rook and queen box the king in.'],
      ['triangleMate', 'A queen and rook form a triangle round the king.'],
      ['swallowstailMate', 'A queen mates a king whose own pieces block its retreat.'],
      ['blindSwineMate', 'Two rooks on the seventh rank mate together.'],
      ['vukovicMate', 'A rook and knight mate, the rook guarded by the knight.'],
      ['balestraMate', 'A bishop and queen mate from a distance.'],
    ],
  },
  {
    name: 'Deeper ideas',
    themes: [
      ['quietMove', 'A move that checks nothing and takes nothing, but wins.'],
      ['defensiveMove', 'The one move that holds.'],
      ['zugzwang', 'The opponent has to move, and every move makes it worse.'],
      ['advancedPawn', 'A pawn close to promoting is the key.'],
      ['promotion', 'Make a new queen.'],
      ['underPromotion', 'Promote to a knight, rook or bishop instead.'],
      ['collinearMove', 'A move along the same line as the last one.'],
      ['castling', 'Castling is the answer.'],
      ['enPassant', 'Take a pawn en passant.'],
    ],
  },
  {
    name: 'Phases',
    themes: [
      ['opening', 'Tactics in the first moves of the game.'],
      ['middlegame', 'Tactics with most pieces still on.'],
      ['endgame', 'Tactics with few pieces left.'],
      ['rookEndgame', 'Rooks and pawns only.'],
      ['pawnEndgame', 'Kings and pawns only.'],
      ['bishopEndgame', 'Bishops and pawns only.'],
      ['knightEndgame', 'Knights and pawns only.'],
      ['queenEndgame', 'Queens and pawns only.'],
      ['queenRookEndgame', 'Queens, rooks and pawns only.'],
    ],
  },
  {
    name: 'Goals and lengths',
    themes: [
      ['mate', 'Finish the game.'],
      ['crushing', 'Win decisive material.'],
      ['advantage', 'Get a clear edge.'],
      ['oneMove', 'Just one move to find.'],
      ['short', 'Two moves to find.'],
      ['long', 'Three moves to find.'],
      ['veryLong', 'Four moves or more.'],
      ['master', 'From games by titled players.'],
    ],
  },
]

/** Every theme the page lists, for checking an address. */
export const THEME_KEYS = new Set(THEME_GROUPS.flatMap((g) => g.themes.map(([key]) => key)))

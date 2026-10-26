# Rookahead's verdicts

This is how Rookahead grades a move. These are our rules, not a copy of any other site's: when another
site disagrees, this page decides. The code in `src/lib/classify.ts` follows it, and any change to how
moves are graded starts here.

**The principle:** a verdict says what the move did to your chances, with credit for finding the only
move and for a sound sacrifice. Captures and checks aren't marked down for being natural: an only move
counts however obvious it is.

## Words used below

- **Winning chance**: the engine's evaluation turned into a chance of winning, 0–100%. Level is 50%,
  about +1 is 59%, +3 is 75%, a forced mate is 100%. Lichess's open curve, the same one as the eval bar.
- **Loss**: how much winning chance a move gives up compared with the engine's best move in that position.
  A move the engine rates as good as its own (or better) loses nothing.
- **Standing**: what the position is for you: an advantage (55% or more, about +0.5), level (45% or
  more), worse but holding (30% or more, about −2.3), or lost.
- **Only move**: the second-best move gives up at least 10% winning chance and leaves you a step down:
  an advantage gone, a level game worse, a worse game lost. Another move that keeps even a little of an
  advantage means it isn't the only move: 39.Qxh8 taking a rook isn't, when 39.Qc2 still keeps +2.8.
- **Only good move**: the second-best move gives up at least 10% winning chance, and doesn't still leave
  you clearly winning (85% or more).
- **Only fast mate**: the move starts a forced mate in 2 or more, and the next-best move doesn't mate or
  takes at least 3 moves longer.
- **Fastest mate**: the same, with the next-best move at least 2 moves longer (for a mating sacrifice).
- **Sacrifice**: you give up material and don't get as much back.
  - **An even trade is never a sacrifice.** What counts is what the opponent takes back. If you take a
    piece and they take one of yours worth the same, nothing was given up: 8…Bxc3 9.Bxc3 (bishop for
    knight) is a trade, so 8…Bxc3 can't be Legendary. If the game goes on 9…Nxe4 10.Qxe4, that knight
    is 9…Nxe4's sacrifice, not 8…Bxc3's: once you capture something yourself, a new exchange begins.
    But a capture that leaves something bigger to be taken isn't an even trade: 12.dxe5 took a pawn and
    left the b5 bishop, 12…Rxb5 took it, and that's a sacrifice of a bishop for a pawn.
  - Otherwise it's a sacrifice when the move gives up material worth at least two pawns (pawns 1,
    knight and bishop 3, rook 5, queen 9) and doesn't win it straight back. Either the opponent's best
    line takes it at once and your next move doesn't take back as much (you're still a pawn or more behind: 9.Rxf5
    exf5 10.Nxf7 gives a rook for a bishop and a pawn), or the move leaves it hanging (free to
    take, or takeable by something cheaper) and the opponent does best not to take it. Winning it back a
    few moves later through a tactic still counts. So does ignoring a piece the opponent has just
    attacked and playing something else.
  - **A deflection counts, even when the material comes straight back.** If the piece that takes yours
    stood in the way, and your next move takes back more than you gave through the square it left, the
    sacrifice is what opened the line: 11…Nxg3 12.hxg3 Qxh1 pulls the h2 pawn off the h-file and wins the
    rook behind it (and if White doesn't take, 12…Nxh1 wins it anyway). Taking back only as much is a
    trade: 13.Bh4 Nxc3 14.Bxe6, a knight for a bishop, though the c3 knight's taker had blocked the way to
    e6. Nor is taking back something you could have taken all along: 1.Nxe5 dxe5 2.Qxa4, when the rook on
    a4 was there for the taking before.
  - Where the game went the engine's way (the opponent answered as the engine expected), the game's own
    moves have to show the sacrifice too. The engine's line may throw in a check that gives more away,
    where the player simply took back: 22.Nd5 Nbxd5 (Kasparov–Topalov) is a trade, because the game went
    23.exd5, though the Lite engine's line had 23.Nc6+ Bxc6 first.
  - Taken at once means the opponent's line goes straight for it, capturing from its first move. If they
    play a quiet move first, the move didn't offer anything: they had to set up the attack, and you chose
    not to answer it. 23.g4 (Rudra_Yagami vs MelonLord-009) isn't a sacrifice of the g5 knight, which
    Black could only win with 23…Be7 and 24…Bxg5.
  - Also not a sacrifice: giving back material the engine already counted as lost (a pinned or trapped
    piece: the evaluation is two pawns or more below the material count; less than that is just
    compensation, as in 12.dxe5, a bishop given for a pawn while a pawn up at 0.00); a check that leaves
    a piece attacked but gives the opponent no time to take it; a piece that has been hanging since before
    the opponent's last move and is left hanging again, unless the move is also the only good move;
    a piece left where it stands while the move attacks as much: if the opponent takes it, your next move
    wins back as much (5…Qxg2 in the Blackburne Shilling Gambit leaves the h8 rook to the f7 knight, but
    6.Nxh8 Qxh1+ is a rook for a rook). The piece that moved is still offered, whatever comes back: a
    person takes a queen they're given (14.Qxh3 Bxh3 15.Bxg5+).

## The verdicts, in the order they're decided

### Forced
The only legal move. Nothing else is Forced.

### Theory
The position after the move is in Rookahead's list of named openings, and every move before it was
Theory too. A book move that would be a **Mistake or worse** by the scale below gets that verdict
instead, and theory ends there. Once a game leaves theory, no later move is Theory.

### The scale
Every other move starts here, by its loss:

| Loss | Verdict |
| --- | --- |
| the engine's own move, or a move that checkmates | **Best** |
| any other move, under 2% | **Strong** |
| 2–5% | **Solid** |
| 5–10% | **Slip** |
| 10–20% | **Mistake** |
| 20% or more | **Blunder** |

Only the engine's move is Best: two good moves are rarely exactly equal, and the engine's evaluations
wobble by a tenth of a pawn or two from one search to the next, so "it came out just as good" isn't
trusted. From a level game: drifting to −0.3 is Solid, −1 (about a pawn) is a Slip, −2 a Mistake, −3 (a piece)
a Blunder. The same drop costs less when the game is already decided: +5 → +4 is Solid, +8 → +5 a Slip.

Then three verdicts can replace the one from the scale.

### Legendary
First of all, Legendary is always a sacrifice. A move that only trades evenly, however strong, is never
Legendary. Replaces Best, Strong or Solid. Either of two ways:

**A sound sacrifice.** All of:
1. The loss is under 3.5% (from a level game, about 0.4 of a pawn), or it's the engine's own move, which
   always passes: any gap there is the engine's evaluations wobbling (19…Bxh3 read −4.53 before and −3.74
   after). It doesn't have to be the engine's move, or any move the engine considered: a sacrifice the
   engine missed counts, as long as it doesn't make your position worse than that.
2. It's a sacrifice. Giving up the exchange (a rook for a knight or bishop) also has to be the only good move.
3. Afterwards you're level or better (45%, about −0.5, counts as level).
4. Before it you weren't already completely winning (under 97%): giving away material in a game that's
   already won isn't a feat. Except when the sacrifice can't be taken: the opponent's best line declines
   it, because taking loses. 21…Qf2 at −23.89 offers the queen, and 22.Rxf2 runs into a back-rank mate.

**A mating sacrifice.** All of: it's the engine's top move and the fastest mate, and it's a sacrifice.
(Rule 4 doesn't apply: you were winning, but only through this move.) Example:
29.Rc4+ dxc4 30.Qd8#, giving up a rook to mate in 2 where anything else takes 4 or more.

### Clutch
The only move. Replaces Best, when the move isn't Legendary. It doesn't have to be hard to find: a free
capture, or an attacked piece moved to its one safe square, counts when nothing else works (10.cxb4
taking a knight left on b4; 9.Bb3, the bishop's only safe square after 8…b5; 54.Rxb1, taking a queen
that promoted with check, where everything else is mated). Either of two ways:

**The only move.** All of:
1. It's the engine's top move.
2. It's the only move: every other move gives up what you have, or would be a Blunder even where it
   keeps some advantage (27.b4+ in Kasparov–Topalov: 27.Re6 still leaves White ahead, but falls from
   +6.0 to +0.9).
3. Afterwards you're level or better, or holding a worse game that isn't lost: 30% or more (about −2.3).
   Below that, it only loses more slowly.

**The only fast mate.** It's the only fast mate.

Never Clutch: taking back what the opponent just took (a recapture on the same square, or a capture
anywhere that only brings the material back to where it was before their capture), and the mating move
itself, which is Best. A capture elsewhere by a piece that was under attack isn't taking back: it's
escaping a threat. 5…Qxg2 takes the queen out of the f7 fork, and it's the only move.

### Oversight
Replaces a Mistake or Blunder. All of:
1. The opponent's previous move was a Mistake or Blunder.
2. Your move gives the gift back: you end up no more than 5% below where you were before their mistake.
   Falling further than that is a Mistake or Blunder of your own.

## Coach notes
These never change a verdict; the coach adds them to the move's explanation.

- **Missed mate**: you had a forced mate and the move let it go. Shown on any Slip, Mistake, Oversight or
  Blunder, and on any move when the mate was in 3 or fewer: "Qh7+ had mate in 3."
- **Slower mate**: you had a forced mate and the move keeps a mate, but a longer one: "Rc4+ mates in 2."
- **Missed win**: you were winning (80% or more) and the move left you level or worse (60% or less):
  "This lets the win slip. Qh7+ kept it."

## Numbers we may tune

These are where the rules draw their lines. Tuning them on real games is allowed; changing what a verdict
*means* is a change to this page first.

| Line | Value |
| --- | --- |
| Material already lost: eval below material by | 2 pawns or more |
| Advantage | 55% (about +0.5) |
| Only move, only good move: second-best gives up at least | 10% |
| …and doesn't still leave you at | 85% or more |
| Only move (Clutch), even keeping an advantage: second-best gives up at least | 20% (a Blunder) |
| Level or better | 45% (about −0.5) |
| Holding, not lost (Clutch) | 30% (about −2.3) |
| Legendary: loss at most | 3.5% |
| Already completely winning (Legendary) | 97% |
| Sacrifice: material given up | 2 pawns or more |
| Only fast mate (Clutch) | mate in 2+, next-best 3+ moves longer |
| Fastest mate (Legendary) | mate in 2+, next-best 2+ moves longer |
| Oversight: back to where you were, within | 5% |
| Missed win | from 80%+ to 60% or less |

When a rule changes, saved reviews are graded again with it (RULES_VERSION in classify.ts). Share links
keep the verdicts they were made with.

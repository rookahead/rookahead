# Rookahead's verdicts

This is how Rookahead grades a move. These are our rules, not a copy of any other site's: when another
site disagrees, this page decides. The code in `src/lib/classify.ts` follows it, and any change to how
moves are graded starts here.

**The principle:** a verdict says what the move did to your chances, with credit for finding a move that
was hard to find. Captures and checks aren't marked down for being natural, and a sacrifice isn't "hard"
just because it gives material away.

## Words used below

- **Winning chance**: the engine's evaluation turned into a chance of winning, 0–100%. Level is 50%,
  about +1 is 59%, +3 is 75%, a forced mate is 100%. Lichess's open curve, the same one as the eval bar.
- **Loss**: how much winning chance a move gives up compared with the engine's best move in that position.
  A move the engine rates as good as its own (or better) loses nothing.
- **Hard to find**: judged the way a person plays, not an engine. A move is easy to find when it's one
  of the moves everyone looks at first: mate in 1; promoting; a capture that doesn't lose the capturing
  piece (taking something worth as much, or something the opponent can't win back); moving an attacked
  piece away to a square where it's safe. Every other move is hard to find: quiet moves (13.d4 opening a
  bishop onto the queen, 25…Bc5 pinning a rook to the king), every sacrifice (14.Qxh3, where a bishop can
  take the queen), and choosing a way out of check: in check, only taking the checking piece safely is
  automatic (5.Bd2, blocking 4…Qb4+ with the bishop it attacked, is a choice among several ways out). An engine sees capture sequences at a glance, so how deep
  it has to search says little about how hard a move is for a person.
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
  - Taken at once means the opponent's line goes straight for it, capturing from its first move. If they
    play a quiet move first, the move didn't offer anything: they had to set up the attack, and you chose
    not to answer it. 23.g4 (Rudra_Yagami vs MelonLord-009) isn't a sacrifice of the g5 knight, which
    Black could only win with 23…Be7 and 24…Bxg5.
  - Also not a sacrifice: giving back material the engine already counted as lost (a pinned or trapped
    piece: the evaluation is two pawns or more below the material count; less than that is just
    compensation, as in 12.dxe5, a bishop given for a pawn while a pawn up at 0.00); a check that leaves
    a piece attacked but gives the opponent no time to take it; a piece that has been hanging since before
    the opponent's last move and is left hanging again, unless the move is also the only good move.

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

**A sound, hard sacrifice.** All of:
1. The loss is under 3.5% (from a level game, about 0.4 of a pawn), or it's the engine's own move, which
   always passes: any gap there is the engine's evaluations wobbling (19…Bxh3 read −4.53 before and −3.74
   after). It doesn't have to be the engine's move, or any move the engine considered: a sacrifice the
   engine missed counts, as long as it doesn't make your position worse than that.
2. It's hard to find.
3. It's a sacrifice. Giving up the exchange (a rook for a knight or bishop) also has to be the only good move.
4. Afterwards you're level or better (45%, about −0.5, counts as level).
5. Before it you weren't already completely winning (under 97%): giving away material in a game that's
   already won isn't a feat. Except when the sacrifice can't be taken: the opponent's best line declines
   it, because taking loses. 21…Qf2 at −23.89 offers the queen, and 22.Rxf2 runs into a back-rank mate.

**A mating sacrifice.** All of: it's the engine's top move and the fastest mate, it's hard to find, and
it's a sacrifice. (Rule 5 doesn't apply: you were winning, but only through this move.) Example:
29.Rc4+ dxc4 30.Qd8#, giving up a rook to mate in 2 where anything else takes 4 or more.

### Clutch
Replaces Best, when the move isn't Legendary. Either of two ways:

**The only good move.** All of:
1. It's the engine's top move.
2. It's hard to find, unless every other move gets you mated or leaves you as good as mated (6 pawns
   or more behind: a review rarely searches deep enough to see the mate itself). Then finding the one
   move that survives is the feat, however obvious it looks: 54.Rxb1, taking a queen that promoted with
   check, where everything else is mated in 6 or less. This is for defence only; delivering a mate of
   your own isn't escaping one.
3. It's the only good move.
4. Afterwards you're level or better, or holding a worse game that isn't lost: 30% or more (about −2.3).
   Below that, it only loses more slowly.

**The only fast mate.** It's the only fast mate and it's hard to find.

Taking back what the opponent just took is never Clutch: a recapture on the same square, or a capture
anywhere that only brings the material back to where it was before their capture.

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
| Only good move: second-best gives up at least | 10% |
| …and doesn't still leave you at | 85% or more |
| Level or better | 45% (about −0.5) |
| Holding, not lost (Clutch) | 30% (about −2.3) |
| As good as mated (Clutch) | 10% (about −6) |
| Legendary: loss at most | 3.5% |
| Already completely winning (Legendary) | 97% |
| Sacrifice: material given up | 2 pawns or more |
| Only fast mate (Clutch) | mate in 2+, next-best 3+ moves longer |
| Fastest mate (Legendary) | mate in 2+, next-best 2+ moves longer |
| Oversight: back to where you were, within | 5% |
| Missed win | from 80%+ to 60% or less |

Reviews and share links made before a rule changed keep the verdicts they were made with.

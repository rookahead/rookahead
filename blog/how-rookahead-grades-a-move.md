---
title: How Rookahead grades a move
description: The rules behind every verdict in a Rookahead review, from Best to Blunder, Clutch and Legendary, shown on Morphy's Opera Game.
date: 2026-10-22
cover: moves 1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 | badge b3 great
order: 3
---

Every move in a Rookahead review gets one of eleven verdicts. They come from a short set of rules we wrote ourselves and keep in a [public rulebook](https://github.com/rookahead/rookahead/blob/main/docs/rulebook.md), so when a verdict surprises you, you can check why. This post walks through those rules using the most famous short game there is: Paul Morphy against the Duke of Brunswick and Count Isouard, played in a box at the Paris Opera in 1858. You can [open the whole game with its review](/r#1.86tWKleyUgpILM1R8M0vKsioVNJRSlKyUnIpzU5V8E4sylHQV3DOL80rUfAszi9NLEpR0lEqUrJSMtQ1UNJRSlGyUrK3t7fXAyOlWkVuLnFOLh4hSREuQUUpQWYOHiZuFgFGGRYFVhV2YWYOBj5GARMzHb24rHeMpxg7mN4w_WCcwvSOeQrLA5YjzEeYZ7FcYDvDdoerj_se1y-uHdwLuO9xT-DpETokdGQH0yEwOrCDiZtLnJVLhINNhEtUQEqGi4OHhZtdgFGGSYFXhVWYgYOBLzQ0NETJTCRJjV1JWFlEhUsBAA) and step through it as you read.

## Winning chance

Engines measure a position in pawns: +1 means White is about a pawn better. That number doesn't say much on its own, because a pawn matters far more in a level game than when you're already a rook up. So Rookahead turns the evaluation into a *winning chance* between 0% and 100%, using the same curve as Lichess and the eval bar. A level game is 50%. About +1 is 59%, +3 is 75%, and a forced mate is 100%.

Each move is then measured by how much winning chance it gives up compared with the engine's best move in that position. We call that the *loss*, and it decides the verdict:

| Loss | Verdict |
| --- | --- |
| the engine's own move, or a checkmate | [[best]] Best |
| any other move, under 2% | [[excellent]] Strong |
| 2–5% | [[good]] Solid |
| 5–10% | [[inaccuracy]] Slip |
| 10–20% | [[mistake]] Mistake |
| 20% or more | [[blunder]] Blunder |

From a level game, drifting to −0.3 is Solid, about a pawn is a Slip, two pawns a Mistake and a piece a Blunder. The same drop costs less once the game is decided: going from +8 to +5 is only a Slip, because you're still winning easily.

Only the engine's own move is Best. Two good moves are rarely worth exactly the same, and an engine's numbers wobble by a tenth of a pawn or so from one search to the next, so a move that "came out just as good" gets Strong.

## Clutch: the only move

Three verdicts can replace the one from the table. The first is Clutch ([[great]]), for the engine's top move when it's the only move in the position.

```board
moves 1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3
badge b3 great
arrow b3f7
arrow b3b7
caption 7.Qb3, Clutch. The queen hits f7, next to the king, and b7 at the same time.
```

"The only move" means every other move throws away at least 10% of your winning chance. Here the next best kept White about a pawn better instead of two and a half.

It doesn't have to be hard to find. 7.Qb3 is a quiet queen move that only works because of two threats at once, and Morphy found two more like it later in the game, 12.O-O-O and 14.Rd1, which are Clutch too. But an obvious move counts just as well when nothing else works.

```board
moves 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O O-O 7.Re1 a6 8.Bb3 Ba7 9.Nbd2 Nb4 10.cxb4
badge b4 great
caption 10.cxb4, Clutch. Black has just put a knight where the c-pawn can take it. Taking it wins a piece; every other move gives Black time to save it.
```

Everyone would play 10.cxb4, and it's still Clutch: what counts is that nothing else worked. So is taking a queen that has just promoted with check, when every other move gets you mated.

Two moves are never Clutch, however necessary: taking back what your opponent just took, which is simply the game going on, and the checkmating move itself, which is Best.

## Legendary: a sacrifice that works

Legendary ([[brilliant]]) is always a sacrifice. However strong a move is, if it only trades evenly it can't be Legendary. The sacrifice also has to be sound (no more than about 0.4 of a pawn worse than the engine's best move) and leave you level or better. And you can't already be completely winning before it, since throwing material away in a won game isn't much of a feat.

```board
moves 1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5
badge b5 brilliant
caption 10.Nxb5, Legendary. A knight for a pawn, to open lines at Black's king while it's still in the middle.
```

After 10…cxb5 11.Bxb5+, White has given a knight for two pawns and Black can't get the pieces out in time.

There's a second road to Legendary: a sacrifice that leads to the fastest mate, at least two moves quicker than anything else. That's how the game ends.

```board
moves 1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+
badge b8 brilliant
arrow d1d8
caption 16.Qb8+, Legendary. The queen goes, 16…Nxb8 is forced, and 17.Rd8 is mate.
```

Not every sacrifice in the game makes it. 13.Rxd7, a rook for a knight, comes out Best. Giving up the exchange has to be the only good move as well to be Legendary, and at that point White had other ways to win.

## Oversight, Theory and Forced

Oversight ([[miss]]) is for a mistake that answers a mistake. If your opponent blunders and your reply gives the gift straight back, landing you about where you were before their error, the move is an Oversight instead of a Mistake or Blunder. It's still a chance thrown away, so it gets a verdict of its own.

Theory ([[book]]) marks the opening moves that are in Rookahead's list of named openings, as long as every move before them was too. A book move that would be a Mistake or worse gets that verdict instead, and theory ends there. Forced ([[forced]]) is for the only legal move.

## When we change the rules

These rules were tuned on real games, and they'll keep changing as people send us games where a verdict looks wrong. Each change goes into the rulebook first. Rookahead keeps the engine's work for every review you've saved, so when a rule changes, your old reviews are graded again in the background, usually without running the engine at all. Changes to the rules are listed in [What's new](/blog/whats-new).

If you think a verdict is wrong, press *Disagree?* on the move, or bring the game to [Discord](https://discord.gg/ebm3NZNHZH). That's how most of these rules got their current shape.

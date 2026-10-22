---
title: What counts as a sacrifice
description: A Legendary move has to be a sacrifice. Here's how Rookahead decides whether a move gave something up, and the game that changed the rule.
date: 2026-10-22
cover: fen 2kr1r2/p1pp4/bnp3q1/2b1PpN1/2P3PP/1P1B4/PB2Q3/2KR3R b - - 0 23 | last g2g4 | badge g4 best
order: 2
---

A move can only be Legendary ([[brilliant]]) in Rookahead if it's a sacrifice, so the question "was that a sacrifice?" decides some of the most interesting verdicts in a review. It sounds easy to answer. In practice it took several rounds of real games to get right, and the latest change came from one of them.

## The short version

A move is a sacrifice when you give up material and don't get as much back. Pawns count 1, knights and bishops 3, rooks 5 and a queen 9, and the gap has to be at least two pawns' worth. Either your opponent takes the material straight away and you can't win back as much with your next move, or you leave it hanging (free to take, or takeable by something cheaper) and your opponent does best to leave it alone.

Winning the material back a few moves later through a tactic still counts. An engine sees that you'll get the queen back in three moves. A person sitting across the board sees a queen they can take, and most will take it. Rookahead judges a sacrifice the way that person would.

## Trades aren't sacrifices

What matters is what your opponent takes back. If you take a bishop and they take your knight, nothing was given up, so a capture that leads to an even trade can never be Legendary, however strong it is.

A capture that leaves something bigger behind is different. In one of the games we tuned the rules on, White took a pawn on e5 and left a bishop on b5 to be taken. Black took it, and that was a bishop for a pawn: a real sacrifice, and a Legendary one, because it was also sound.

## The game that changed the rule

Here's the position that taught us the newest part of the rule. White has just played 23.g4, attacking the f5 pawn.

```board
fen 2kr1r2/p1pp4/bnp3q1/2b1PpN1/2P3PP/1P1B4/PB2Q3/2KR3R b - - 0 23
last g2g4
arrow c5e7 red
caption After 23.g4. Black can win the knight on g5, but only by first bringing the bishop round with 23…Be7.
```

The knight on g5 is attacked by Black's queen and defended once, by the h4 pawn. Black can win it, but not straight away: first 23…Be7 to attack it a second time, then 24…Bxg5. The first version of the rule said that ignoring a piece your opponent can win is a sacrifice, so 23.g4 came out Legendary.

That verdict looked wrong, and it was. White didn't offer the knight. Black would have had to set up the attack with a quiet move first, and White simply chose not to deal with a threat that wasn't there yet. Plenty of ordinary moves do the same.

So the rule now asks that the material is *taken at once*: the opponent's best line has to go straight for it, capturing on its first move. If they need a quiet move first, the move didn't offer anything. 23.g4 is now graded Best, and every review saved before the change was graded again with the new rule.

## A few more cases that aren't sacrifices

Giving back material that was already lost isn't a sacrifice. If one of your pieces is pinned or trapped and the engine already counts it as gone, letting it go costs you nothing new. We only treat it that way when the evaluation is at least two pawns below the material count. A smaller gap is just compensation, the kind of positional edge a real sacrifice buys.

A check that leaves a piece attacked doesn't count either, because your opponent has no time to take it. The same goes for a piece that was already hanging before your opponent's last move and is left hanging again: you didn't offer it now. The one exception is when leaving it there is also the only good move.

## Why it matters

If too many moves count as sacrifices, Legendary loses its meaning and turns up three times a game. If too few count, you play the move of your life and get a plain Best for it. We'd rather be strict and have a Legendary mean something, which is why every one of these cases came from a real game where the verdict looked wrong.

You can read the whole set of rules in [How Rookahead grades a move](/blog/how-rookahead-grades-a-move), or the exact wording in the [rulebook](https://github.com/rookahead/rookahead/blob/main/docs/rulebook.md). If you find a game where we got it wrong, press *Disagree?* on the move. The next change to this rule will probably start there.

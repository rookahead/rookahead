---
title: What's new in Rookahead
description: Every change to how Rookahead grades moves, and the bigger new features, newest first.
date: 2026-10-27
cover: moves 1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 | badge b5 brilliant
order: 1
---

This page lists every change to the verdict rules, so you can see why a move's verdict might differ from the last time you looked, along with the bigger new features. Newest first. When a rule changes, the reviews you've already saved are graded again with the new rules.

## 27 October 2026

**Rules:** a move is now graded against what the game went on to show, not only the engine's first look. Before a move is called a mistake, every search that ranks it has to agree, and opening positions take their evals from the Lichess cloud.

**Rules:** Clutch is the only move that keeps what you have. It now also counts an only move whose alternatives would all be Blunders, a capture that gets a piece out of a threat, and a checkmate when every other move gives the game away.

**Rules:** a sacrifice is checked against the moves actually played. A deflection counts, even when the material comes straight back. A piece left to a counter-attack doesn't, and neither does a trade through the taking piece's square. A pawn grabbed when you're a queen down no longer counts as taking the queen back, and the move that allows a checkmate is never Best.

- A new review panel with Summary, Review and Analysis tabs. The graph doubles as the review's progress bar, and the board's actions sit in the panel's header.
- The coach explains every move: why a mistake was a mistake, and a sacrifice through the line where it's taken. Click a row to play its moves on the board, and point at a move in an engine line to preview it.
- The engine's lines show up as soon as they come, and moves you play on the Analysis board get verdicts too.
- Think a verdict is wrong? Tap the flag on the coach card to tell us. Bugs, ideas and verdicts can also go in an [issue on GitHub](https://github.com/rookahead/rookahead/issues/new/choose).
- A new Home on desktop, and a new My games.
- Reviews run smoother and keep the board responsive, and fall back to a simpler engine on browsers that can't load the fast one.
- The board resizes smoothly, sits in the middle of the window, and keeps verdict badges inside its edges.
- The blog has a new look and a search box, and there's a [Donate](/donate) page.

## 23 October 2026

- A new Home. Today's plan lists a few things worth doing today and ticks them off as you do them: review your latest game, solve the daily puzzle, fix a few of your mistakes when you have some, and play a game. It replaces the Today list in the sidebar.
- An Accuracy card with a chart of your last 20 reviewed games. Point at a game to see its accuracy, and click it to open the review. Below the chart is your accuracy in the opening, the middlegame and the endgame, with the weakest of the three picked out.
- A Puzzle streak card that shows the last two weeks, a flame on each day you solved a puzzle.
- Home on a phone is much shorter: your latest game, your mistakes and the daily puzzle are compact cards, and your accuracy and streak share one card.
- Home keeps its shape while it loads, so the cards don't jump when your games arrive.
- Pages no longer shift sideways when you go from a short page to a long one.


**Rules:** Clutch is the only move, however obvious. A free capture, or an attacked piece moved to its one safe square, now counts when nothing else works. Taking back what your opponent just took, and the checkmating move itself, stay Best. We tested the change on purpose-built positions and on real games before making it.

- A new look: your colour theme now tints the whole app, in Light, Dark and a new Black mode with a true black page for AMOLED screens. Black replaces Dim, and Sky is still the default.
- A Theme board, now the default, in your colour theme's own shades. The eval bar uses your board's colours.
- The Rookahead logo, the sidebar and the sign-in page are in your colour, and the blog, About and Privacy pages follow your theme.
- Icons on Home's cards, and a short transition between pages.
- Home opens much faster when you have many reviewed games, and scrolling and buttons work while it loads.
- This blog, with posts on [how Rookahead grades a move](/blog/how-rookahead-grades-a-move) and [what counts as a sacrifice](/blog/what-counts-as-a-sacrifice).
- A [Discord server](https://discord.gg/ebm3NZNHZH) for chess talk, questions about verdicts, bug reports and ideas. It's linked from the sidebar, the You tab and the About page.

## 21 October 2026

**Rules:** a sacrifice has to be taken at once. If your opponent can only win the material after a quiet move first, your move didn't offer it, so it isn't a sacrifice and can't be Legendary. The game behind this is in [What counts as a sacrifice](/blog/what-counts-as-a-sacrifice).

Saved reviews now keep the engine's work, so a rule change regrades them in the background without running the engine again. Reviews saved before this change are reviewed once more the next time you open them.

- Board sounds for moves, captures, checks and the end of the game.
- Legendary moves lift off the board when they're played, and the end of a game is marked on the board.
- A page of every Legendary move from your reviewed games.
- A new Home on phones: your latest game first, then your Legendary moves, accuracy, mistakes to fix and the daily puzzle.
- Pages load with placeholders in place of empty space, and Rookahead tells you when you're offline.

## 20 October 2026

**Rules:** Rookahead's verdicts became our own [written rules](https://github.com/rookahead/rookahead/blob/main/docs/rulebook.md). The main changes from before:

- Only the engine's own move is Best. A different move that comes out almost as good is Strong.
- "Hard to find" is judged the way a person plays, not by how deep the engine had to look. Mate in one, promotions, safe captures and moving an attacked piece to safety are easy to find; quiet moves and sacrifices are hard.
- A sacrifice that wins the material back a few moves later through a tactic still counts as a sacrifice.
- A sacrifice your opponent should decline, because taking it loses, can be Legendary even when you were already winning.
- In defence, finding the one move that doesn't get mated is Clutch however obvious it looks. Taking back material your opponent just took is never Clutch.

Also new:

- Rookahead works as a phone app: add it to your home screen, and it opens full screen with a tab bar.
- Colour themes (Sky, Gold, Indigo, Coral, Forest and Ivory) and a Dim mode between dark and light.
- The computer plays more like a person: at the lower levels it makes the mistakes people at that rating make.
- Settings got their own page, and the engine's options moved beside the board.
- The Full version of Stockfish 19, with its full-size network.

## 18 and 19 October 2026

Rookahead went online at rookahead.com, with:

- Game reviews with our own verdicts, from Legendary to Blunder.
- Your games from Chess.com and Lichess, by username.
- Share links for a game or a single move, plus images, GIFs and an embeddable board.
- Puzzles: rated, daily, sprint, and puzzles made from your own mistakes.
- Play the computer at eight levels, with every time control.
- Accounts, to keep your games and progress on more than one device.

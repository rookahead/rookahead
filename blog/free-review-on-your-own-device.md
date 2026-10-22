---
title: Free game review, on your own device
description: Why Rookahead can review every game you play for free: Stockfish 19 runs in your browser, on your computer or phone, and your games stay there.
date: 2026-10-22
cover: moves 1.e4 | badge e4 best
order: 4
---

Reviewing a chess game takes a lot of computing. The engine looks at every position in the game, deeply enough to tell a good move from a slightly worse one, and a 40-move game has 80 of them. When a website does that on its own servers, every review costs it money, which is why free reviews usually come with a daily limit or sit behind a membership.

Rookahead runs the engine on your device instead. When you press Review, your browser runs Stockfish 19 on your own processor and works through the game there. We don't pay anything per review, so there's nothing to limit. You can review every game you play, every day.

## How it works

Stockfish is the strongest chess engine there is, and it's free software. The [Stockfish.js](https://github.com/nmrugg/stockfish.js) project compiles it to WebAssembly, a format browsers run at close to the speed of a normal program. Rookahead loads that build when you open a review and talks to it the way any chess program talks to an engine: here's a position, how good is it, and what's the best move?

It uses more than one core. Browsers only allow a page to run several engine threads when the page is *cross-origin isolated*, a security setting that stops other sites' content from mixing with it, so every Rookahead page is served that way. By default the engine gets about two thirds of your processor's cores, which leaves the rest for the browser itself so the page stays smooth while it thinks.

There are two versions of the engine to choose from, in the engine settings beside the board:

- **Lite** is the default. Its neural network is small, so it downloads in a moment (about 1.6 MB) and runs well on phones.
- **Full** is Stockfish 19 with its full-size network. It's a bit stronger and a much bigger download (about 100 MB), so it makes sense on a computer with a good connection.

The review searches each position to depth 16 by default. You can raise that under the coach card if you'd like a deeper look at a sharp game, and lower it on a slow phone.

## Your games stay with you

Since the analysis happens on your device, your games don't have to go anywhere. When you paste a game, it stays in your browser. When you bring in games from Chess.com or Lichess, your browser asks those sites for them directly, using their public game lists. Reviews are saved in your browser too, so opening a game you've already reviewed is instant.

If you make an account, your games, reviews, puzzle rating and settings are copied to it so you can pick them up on another device. That's the one case where they're stored on our side, and only because you asked for it. Share links don't need an account either: the game and its review are packed into the link itself.

## What it costs you

Running the engine yourself has a price, and it's paid in battery and time. A phone is slower than a laptop, so a long game takes longer to review there, and the engine will warm the phone up while it works. Reviewing on a laptop that's plugged in is the fastest way. A server farm can also search deeper than your device in the same time, though for the games most of us play, depth 16 is usually enough to find the moves that decided them.

We think that's a fair trade for a review with no limit and no account. If your device struggles, tell us on [Discord](https://discord.gg/ebm3NZNHZH) what you're using; it helps us tune the defaults.

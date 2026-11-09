---
title: Privacy
description: What Rookahead does and doesn't collect: optional accounts, games analysed on your device, cookieless analytics.
updated: 2026-11-09
---

<div class="note">

**In short:** You can use all of Rookahead without an account. If you make one, we keep your email, your name and your progress so it follows you to other devices, plus a simple log of when you use the app. Games are analysed on your own device. Visits are counted without cookies.

</div>

## Accounts are optional

Everything works without signing up, and then we have no personal information about you at all. If you do sign up, your account holds:

- your email address and your username, used only for your account (we never send newsletters or share them);
- if you sign in with Google, the name and profile picture link Google gives us;
- your progress: puzzle rating and streaks, games you played here, your review history and your settings, so they are the same on every device;
- a usage log: when you open Rookahead, start or finish a review, solve a puzzle, open Explain or finish a game against the computer, with the kind of device (app, phone or computer). It never holds your moves, your games or anything you type. We use it only to see whether people come back and which parts of Rookahead they use; it is never shared or sold, and it is deleted with your account.

If you sign up with email, you also choose a password; it is stored only as a secure hash, never as the password itself. Accounts are stored by Supabase, our database provider, and account emails (confirming your address, resetting your password) are sent through Resend. Signing in keeps a login token in your browser's storage; it isn't a tracking cookie. You can delete your account, and everything in it, at any time under Settings → Delete account.

## Public profiles are off unless you turn them on

Your profile is private: only you see it. If you choose **Make public** on it, anyone with its link (rookahead.com/@yourname) can see your username, your photo, the month you joined, your online and puzzle ratings, and how many games you've played and reviewed, with your Legendary moves count. It never shows your games, your moves or the people you played. **Make private** takes it down at once, and deleting your account deletes it too.

Anyone can report a public profile's name or photo. A report holds the username, the reason and an optional note, plus your account if you're signed in; we read them only to keep profiles within the rules.

## Your games are analysed on your device

The chess engine runs in your browser. Games you load or play are analysed on your computer or phone. Without an account nothing is logged, and your settings, progress and the game you're working on are saved only in your browser's storage, so they survive a refresh; clearing your browser's site data removes them. With an account, the progress listed above is also copied to your account.

## Importing from Chess.com and Lichess

When you load games by Chess.com or Lichess username, your browser fetches that player's public games directly from that site's public API. That site's own privacy policy applies to the request.

## Connecting your Lichess account

If you choose **Connect Lichess**, you sign in on lichess.org itself and Lichess gives your browser a token for your account. The token stays in your browser's storage only: it is never sent to Rookahead's servers or stored in your Rookahead account, and we never see your Lichess password. Your browser uses it to ask Lichess's opening explorer about the position on your board (Lichess requires a signed-in account for that), and to play the online games you start in Play: finding an opponent, sending your moves and following the game all happen between your browser and Lichess, as on lichess.org, and those games are Lichess games under its own rules and privacy policy. **Disconnect** under Settings → Linked accounts deletes the token here and asks Lichess to cancel it.

## Lichess cloud evals

When a game is reviewed, your browser asks lichess.org for its stored deep evaluations of the opening positions, one position at a time, until Lichess has none. Only the positions are sent, never your name or the game's players. You can turn this off under Game review → Lichess cloud evals.

## Share links

A share link carries the game and its review inside the link itself, after the "#". Browsers don't send that part to any server, so we never see shared games. Anyone you give a link to can open the game, so share accordingly.

## Hosting and visit counts

Rookahead is hosted by Cloudflare. To count visits we use Cloudflare Web Analytics, which uses no cookies and no personal identifiers. It reports totals such as pages viewed, countries, browsers and which sites people came from. Like any web host, Cloudflare processes technical data such as IP addresses to deliver the site and protect it from abuse.

## Sponsored links

The sponsored card links to Amazon. Nothing is loaded from Amazon until you click it. If you do, Amazon may use cookies on its own site to record that you came from Rookahead, under Amazon's privacy notice. **As an Amazon Associate I earn from qualifying purchases.**

## Embedded boards

Other websites can embed a Rookahead board. The same rules apply there: the game travels in the link, and no cookies are set.

## Changes and contact

If this policy changes, the date at the top will change too. Questions? Open an issue on [GitHub](https://github.com/rookahead/rookahead/issues).

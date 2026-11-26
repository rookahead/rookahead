---
version: 1
name: Rookahead
description: A calm, dark chess app. Neutral black and charcoal, one white card and one deep-blue card to lead the eye, blue buttons, green for progress. Rounded rectangles, never pills.
colors:
  page: "#111111"
  card: "#222222"
  card-hover: "#2a2a2a"
  raised: "#333333"
  line: "rgba(255, 255, 255, 0.07)"
  line-strong: "rgba(255, 255, 255, 0.14)"
  text: "#ededee"
  text-2: "#bdbdc0"
  muted: "#85858a"
  paper: "#f4f4f6"
  on-paper: "#111113"
  primary: "#2f4bd1"
  primary-hover: "#3a57e0"
  on-primary: "#ffffff"
  link: "#93a3ff"
  brand-card: "#101c4c"
  on-brand-card: "#e3e7ff"
  progress: "#2ee87a"
  win: "#7fc35f"
  loss: "#e5735f"
  legendary: "#8b5cf6"
  blunder: "#c7372f"
  streak: "#ff9a4d"
  heart: "#db61a2"
typography:
  greeting:
    fontFamily: Elms Sans
    fontSize: 20px
    fontWeight: 700
    lineHeight: 26px
    letterSpacing: -0.02em
  card-title-lg:
    fontFamily: Elms Sans
    fontSize: 21px
    fontWeight: 700
    lineHeight: 26px
    letterSpacing: -0.02em
  card-title:
    fontFamily: Elms Sans
    fontSize: 19px
    fontWeight: 700
    lineHeight: 24px
    letterSpacing: -0.02em
  tile-title:
    fontFamily: Elms Sans
    fontSize: 16.5px
    fontWeight: 700
    lineHeight: 21px
    letterSpacing: -0.02em
  number:
    fontFamily: Elms Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.02em
  name:
    fontFamily: Cabin
    fontSize: 15.5px
    fontWeight: 600
    lineHeight: 21px
  body:
    fontFamily: Cabin
    fontSize: 14.5px
    fontWeight: 400
    lineHeight: 20px
  label:
    fontFamily: Cabin
    fontSize: 13.5px
    fontWeight: 600
    lineHeight: 19px
  caption:
    fontFamily: Cabin
    fontSize: 12px
    fontWeight: 400
    lineHeight: 17px
  button:
    fontFamily: Cabin
    fontSize: 14.5px
    fontWeight: 600
    lineHeight: 1
  meta:
    fontFamily: DM Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0.08em
    textTransform: uppercase
  micro:
    fontFamily: DM Mono
    fontSize: 9px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.16em
    textTransform: uppercase
rounded:
  xs: 6px
  sm: 9px
  row: 10px
  md: 12px
  card: 16px
  full: 9999px
spacing:
  unit: 4px
  tile-gap: 13px
  widget-gap: 12px
  section-gap: 24px
  column-gap: 48px
  card-padding: 20px
  tile-padding: 16px
layout:
  sidebar: 208px
  main: 720px
  right: 360px
  content-max: 1128px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 42px
    padding: 0 16px
  button-secondary:
    backgroundColor: transparent
    border: "1px solid {colors.line-strong}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 42px
  button-row:
    border: "1px solid color-mix({colors.link} 40%)"
    textColor: "{colors.link}"
    rounded: "{rounded.row}"
    height: 36px
    width: 92px
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  card-highlight:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.on-paper}"
    rounded: "{rounded.card}"
  card-brand:
    backgroundColor: "{colors.brand-card}"
    textColor: "{colors.on-brand-card}"
    rounded: "{rounded.card}"
  card-highlight-size:
    height: 176px
  card-brand-size:
    height: 320px
  widget:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    height: 128px
  tile:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    height: 176px
    padding: "{spacing.tile-padding}"
  game-row:
    height: 72px
    rounded: "{rounded.md}"
  result-mark:
    size: 22px
  badge:
    height: 20px
    rounded: "{rounded.xs}"
    typography: "{typography.meta}"
---

# Rookahead design

## Overview

Rookahead reviews your chess games for free. The look should feel calm, sure of itself and a little playful, like a
good coach: not a casino, not a dashboard. Most of the screen is neutral black and charcoal, so the few things in
colour are the ones that matter. On every page, at most **one white card** (the thing to do next, like Game review)
and **one deep-blue card** (the other big way in, like Play online) lead the eye. Everything else is a flat charcoal
card. Buttons are blue, progress is green, and nothing else carries colour unless it means something (a win, a loss,
a Legendary move).

Shapes are rounded rectangles throughout. Avatars and status dots are the only circles.

## Colors

### Brand & accent

- **Primary** ({colors.primary}): every button that does the main thing: Review, Play, Sign up. (The logo is the board's blue #3c6bd7 rook on a square tile of its light blue #a5b9e8: the tab icon, the app icons and everywhere outside the site. On the site itself (sidebar, header, footer, blog) it's black and white: a black rook on a square white tile, white on black in the light theme.)
- **Primary hover** ({colors.primary-hover}): the same button, pointed at.
- **Link** ({colors.link}): words in the accent colour on dark: links, the name in the greeting, the current page in
  the sidebar, outlined row buttons. The primary blue is too dark to read as text on charcoal; this lighter blue is
  the same hue.
- **Brand card** ({colors.brand-card}): the one deep-blue card (Play online). Its buttons are the primary blue, one
  shade brighter in the same hue, so they sit in the card rather than on it.
- **Paper** ({colors.paper}): the one white card (Game review), with {colors.on-paper} text and a primary-blue button.

### Surface

- **Page** ({colors.page}): the page and the sidebar. Neutral, no tint: the reference app's own black.
- **Card** ({colors.card}): every ordinary card, widget and tile. Flat: no border, no shadow.
- **Card hover** ({colors.card-hover}): a card under the pointer.
- **Raised** ({colors.raised}): things on a card: chips, inputs, steppers.
- **Line** ({colors.line}): hairlines between list rows. **Line strong** ({colors.line-strong}): outlines of
  secondary buttons.

### Text

- **Text** ({colors.text}): headings, names, numbers.
- **Text 2** ({colors.text-2}): the coach's line, secondary copy.
- **Muted** ({colors.muted}): captions, meta, ratings beside names.

### Semantic

- **Progress** ({colors.progress}): goal rings, ticks, accuracy bars, the online dot. Progress is always green,
  whatever the accent.
- **Win / Loss** ({colors.win}, {colors.loss}): the W and L marks, rating up and down.
- **Legendary** ({colors.legendary}), **Blunder** ({colors.blunder}): move grades, as in a review.
- **Cassie** (#ffffff, eyes #17171c): the rook mascot (Cassie's tile, Play's tile, the greeting's face), white
  (lilac #e9b6fb in the light theme): the rook's battlements over a straight body, as wide at the foot as at the top
  (never heavy at the bottom), tipped -6° on her tile and floating slowly.
- **Streak** ({colors.streak}): the puzzle streak's flame (Puzzles). Home's counter at the greeting's end is the
  visit streak (days in a row you opened Rookahead), in the widgets' look: a card, a green flame, a white number. **Heart** ({colors.heart}): Donate.

### Modes

One dark theme, on the reference app's own blacks (#111111 page, #222222 cards); no separate AMOLED. Light swaps the
surfaces: a neutral grey page #e4e4e4 and off-white cards #f7f7f7 (no tint in either), text #111113, link
{colors.primary}. The page you're on in the sidebar is a card-coloured pill under the dark word, not a filled colour. Game review in the
sidebar takes the pale card's colours (#d9e1ff under navy words, its count navy with a white number).
The navy cards (Play online, the welcome card, Play's online card) turn pale: card #d9e1ff, controls #c3cfff, words
navy #0d1b5e, small words #2f4fc9, and only the main button stays strong (#1b4ef5, white words).

## Typography

### Font family

- **Elms Sans** (OFL): headings, card titles, big numbers. Weight 700, tracking -0.02em.
- **Cabin** (OFL): everything you read: names, buttons, the sidebar, body copy.
- **DM Mono** (OFL): small uppercase meta ("10 MIN · NOV 17"), micro labels ("ACCURACY"), badges.

### Wordmark

ROOKAHEAD in one word, drawn, not typed (src/wordmark.json, from Russo One, OFL):

- **ROOK** stands upright in the text colour. Its two O's are squared, with narrow tall openings: two eyes.
- **AHEAD** leans 16° in the link blue, and its A is pushed into the K. The K is cut along the A's edge, leaving a
  thin gap, so AHEAD grows out of ROOK.
- Beside the logo tile it's 13.5px tall at the capitals, centred on the tile by its capitals.
- In the sidebar it's stacked, ROOK over AHEAD, 6px from the tile: R and K grey (#8c8c90), the O's in the text colour
  each with the coach's oval eye in the page's colour, set towards its right (looking ahead), AHEAD in the text colour.
- On the sign-in page it fills the blue half, its letters flying in.

### Hierarchy

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| greeting | 20px | 700 | 26px | -0.02em | "Good morning, name" |
| card-title-lg | 21px | 700 | 26px | -0.02em | The white and blue cards' titles |
| card-title | 19px | 700 | 24px | -0.02em | "My games" and other card headings |
| tile-title | 16.5px | 700 | 21px | -0.02em | Small tiles: Coach, Puzzles, Play the computer |
| number | 32px | 700 | 1 | -0.02em | Widget numbers (81.9, ↗19), tabular |
| name | 15.5px | 600 | 21px | 0 | Opponent names in game rows |
| body | 14.5px | 400 | 20px | 0 | The coach's line, card subtitles |
| label | 13.5px | 600 | 19px | 0 | Widget names |
| caption | 12px | 400 | 17px | 0 | Lines under widget names, tile subtitles |
| button | 14.5px | 600 | 1 | 0 | Buttons; 16px in the sidebar |
| meta | 11px | 400 | 18px | 0.08em | Uppercase mono meta |
| micro | 9px | 400 | 1 | 0.16em | Uppercase mono labels under numbers |

### Principles

- Elms for anything you'd glance at, Cabin for anything you'd read.
- Numbers are tabular, so columns of accuracy line up.
- Never more than three sizes in one card.

## Layout

### Spacing system

A 4px unit. Between cards and tiles: 13px; between widgets: 12px. Greeting to widgets: 24px; widgets to My games:
28px. Between the two columns: 48px. Inside cards: 20px; inside small tiles: 16px. (These are the reference app's
own measurements, in CSS pixels.)

### Grid & container

Desktop: sidebar 208px (a 216px panel, its items 192px wide); content 1128px at most (a 720px main column, a 48px gap, a 360px right column), centred
in the rest. The right column stays put while the main column scrolls. Designed against a 1536 × 696 CSS-pixel window (a
1920 × 1080 screen at 125%): the right column scrolls on its own when it's taller than that.

Right column, top to bottom (it scrolls by itself; a 6px handle shows 6px beside it only while it moves): four small
tiles, two by two, 174 × 198px (Fix your mistakes, the review's blunder mark at 92px that spins like a coin into the Legendary mark with purple sparkles while you point at it; Puzzles, two fanned boards in your colours, pieces showing on the one behind; Coach, a teaching board hung on a cord (your colours in a white frame, still) showing back-rank mate just played: the rook's two squares soft yellow (#ecd06a) with a thin white arrow up them, the king's square the Puzzles tile's red (--danger at 75%), the lilac pointer at the rook; Cassie, the white rook, the computer you play, floating slowly), the
blue card (Play online, about 320px: the players on Lichess now, an 80px time selector beside an 80px
Rated/Casual block (a trophy or a cup and its word; tapping flips it), an 80px Start, Powered by Lichess with its knight; one saturated blue in three steps: card #00206b, controls #002f9e, Start
#3874ff with white text, small text #88a2dd; Home's first-visit welcome card and Play's online card use the same three steps). The tiles' little boards use the board pieces (see Pieces), shrunk to 82% about the square's centre. Widgets: five to a row, 128px tall,
sharing the main column's width. Game rows: 72px.

### Whitespace philosophy

Room between things, not inside them: cards are generous apart, compact within. A widget row may end short of the
column's edge rather than stretch.

## Elevation & depth

Flat. Cards sit on the page by colour alone. The white card alone may carry a soft drop shadow
(0 18px 40px -28px rgba(0,0,0,.6)). Small boards in card art get a shadow to lift off their card.

## Shapes

### Border radius scale

| Token | Value | Use |
|---|---|---|
| xs | 6px | Badges, steppers |
| sm | 9px | Chips, time choices |
| row | 10px | Row buttons, result marks |
| md | 12px | Buttons, inputs, sidebar items, hovered rows |
| card | 16px | Cards, widgets and tiles |
| full | 9999px | Avatars and status dots only |

### Illustration geometry

Card art is a corner of a chessboard, tilted 8–12°, partly cut off by the card's edge, or the coach (the rook) rising
from the card's foot. Art never sits behind text.

### Pieces

The board's pieces are Rookahead's own (src/pieces.css), drawn for it: solid shapes with almost no detail, each on a
flat plate. White is white with a dark edge (#34343e); black is #34343f with a near-black edge (#17171c) and a soft
light ring outside it (white at 30%) that lifts it off the dark squares. Edges are about 2.5px on a 90px square, and no
corner is sharp: outer corners round off, inner ones fill in. Heights as a share of the square, edge included: pawn
and rook 77%, bishop 79.5%, knight 80%, queen 82%, king 85%. The only details: the knight's eye (a short dash along its forehead,
light on the black knight), the bishop's curved cut (open, so the board shows through) and the king's cross. The
queen has four ball-tipped points on a band that flares to the plate; the rook's battlements are a separate block
over a straight body. The king's cross is a thick plus, as wide as it is tall, its corners kept almost square so it
reads clearly small; its body is a little narrower than the plate. On the black king the plus is 0.7 thinner on each
side, since there the dark edge reads as part of the shape and would make it bulky.

## Components

**`button-primary`**: the main action. Primary blue, white text, 42px tall, radius 12px. On the white card and the
blue card alike. Hover: primary hover. Press: scale 0.96.

**`button-secondary`**: the second action beside it (Import, Play a friend). Transparent with a 1px line-strong
outline on dark cards; on the blue card, a 12% wash of its text colour instead.

**`button-row`**: the action at a list row's end. Outlined in the link blue, 36px tall and 92px wide, radius 10px; it fills with primary blue
while its row is pointed at. A row whose review exists says Open, in the muted outline.

**`card`**: flat charcoal, radius 16px, padding 20px. **`card-highlight`**: the white card. **`card-brand`**: the
blue card. One of each per screen at most.

**`widget`**: a tile in the widget row: picture on top (a ring, a number, a small board), name and caption at the
foot, centred. 128px tall, radius 16px. Always five in a row, from six: Daily puzzle, Games reviewed, Mistakes fixed,
Games played, Rating, Weakest phase. Pointed at, a round pencil shows in the corner: it opens
a dialog: a centred title ("Change your daily goal"), a goal's own number as − n + (lilac
buttons, the number large, any from 1 to 10, shown on the tile at once) or the speeds Rating can follow as 60px rows
(the current one outlined in lilac), then "Swap for" with the other widgets as tiles. Every goal with a target is a
ring (0/1 too) named as a goal: Review goal, Mistakes fixed, and the play goal named for your online time (Rapid
goal), counting only games at that speed. Pointed at, a widget
only changes its fill: nothing lifts, tips or draws itself. Drag a widget along the row (mouse) to move it: the
others slide aside, and the order is saved. The Daily puzzle's mark: a calendar page shaped like a
puzzle piece, today's date cut out of it.

**`tile`**: a small picture card: title and subtitle at the top left, art rising from the foot. 176px tall.

**`game-row`**: a game in a plain list: the result mark, the opponent with their rating in brackets, and under it
an icon for how fast it was (a bullet, a bolt, a rabbit, a turtle, a paper plane, infinity: the clock in its
tooltip), when, and your accuracy once reviewed. Hairlines between rows start at the name. Pointed at, a row dims to
70%: no fill, no movement.

**`result-mark`**: a game's result as a 22px icon: a trophy in the primary blue, a red flag, or half a point in grey.

**`badge`**: a count of grades in a game, like "!! 2", in mono on a 22% tint of the grade's colour.

**Legendary moves strip** (Home, under My games): a heading with All ›, then cards 296px wide in a row you swipe,
or step through with round arrows on its edges; an edge with more beyond it fades out. A card: the opponent's face,
name (rating), when · the result, the !! badge; the move; its board. The board shows the move made; it plays it again
(the piece slides in over what it took, then the arrow and the badge pop) when you point at it or bring it into view.

**Time choices**: segmented rectangles (30px tall, radius 9px), the picked one filled with the card's text colour.

**Sidebar**: at the top the logo (a 34px black-and-white tile, 2px in from the bars' left edge) and beside it the name in two lines: ROOK (R and K
dimmed, the O's solid eyes with pupils looking ahead) over AHEAD in white, set 9px to the right; 12px capitals, the two lines (28px) a little shorter than the tile. Then Home, Play, Puzzles, Tools (a menu: Analysis board, Board editor,
Import a game), Game review (the game you were just on, or Load a game; a soft lilac wash, lilac word and icon, and a
lilac pill at the row's end counting this week's games not reviewed yet, up to 99+). At the foot, the pink
Support button, Search, a row of icons (theme, sound, settings, Community, Blog, Collapse) and your card. Home has no
Game review card: several unreviewed games show as a "Review N games" link in My games' header.

**Sidebar item**: Cabin 600, 16px, 34px tall with 8px between, radius 8px, a solid 20px icon (the same on its page and off it). The
words and icons are white, on every row; the current page is filled a deeper lilac (#7f509b) under the same white
word and icon, and a grey background marks the row under the pointer. Game review and Support keep their own colours (lilac,
pink). It switches at once, with no fades.

**Rated puzzles page**: Home's coach over the board (its face and the comment only), Difficulty under it, each in a
player bar's room. One flat card beside it, a hairline between its parts: the puzzle (the puzzle piece, "Puzzle #id"
linking to Lichess, whose move with that side's king on a light square, then the game it's from: speed icon, clock,
times played, both players), your rating with Rated, a 14px bar of your chapter's XP in the goal green with the run
and "Chapter n · x / y XP" under it, your last ten (the board's blue with a tick, red with a cross), then Hint and the
round icon row (settings, whose menu holds Jump to next puzzle; flip; the move arrows).

## Motion

Nothing moves when a page arrives: the first frame is the final frame. Everything answers the pointer:

- Cards themselves never move: no lift, no press. The art inside a card may move while it is pointed at.
- Card art moves with a spring (cubic-bezier(.34,1.56,.64,1), about 500ms): a piece makes its move, a board tips,
  the coach stands up straight.
- Numbers and bars may grow into place on hover, never on load.
- With reduced motion, all of it is instant.

## Do's and Don'ts

### Do

- Keep the page and cards neutral; let colour mean something.
- Use the white card for the one next thing to do, and the blue card for the other big way in.
- Make progress green, always.
- Keep every button a rounded rectangle (radius 12px; 10px in rows).
- Check the right column at 1536 × 696 before shipping.

### Don't

- Don't make pill buttons or round buttons (avatars and dots excepted, and the icon row at the foot of Rated puzzles' panel: round, outlined in line-strong).
- Don't tint the page or cards with the accent.
- Don't put two blue cards or two white cards on one screen.
- Don't use primary blue as text on charcoal; use the link blue.
- Don't animate on load, and don't slide cards in. The one exception: the greeting's line types itself out from
  the left (24ms a letter) as the page opens, as if the coach were writing it.
- Don't use gradients on cards.

## Responsive behavior

### Breakpoints

- Desktop: 920px of page width and up, two columns.
- Phone: one column in the desktop's order, the same parts; no phone-only designs.

### Touch targets

44px at least on phones.

### Collapsing strategy

The right column goes under the main column, in the same order. Widgets wrap two to a row.

## Iteration guide

Change a token here first, then in src/index.css. A new colour must have a job in the Semantic list, or it isn't
added.

## Known gaps

- The palette is the first of our own; other colour themes come back only after testing.
- Phone Home isn't redesigned yet.

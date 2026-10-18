# Sign-up and sync — design

## Goal

Optional accounts, so a player's puzzle rating, streaks, played games, review history and settings
survive a cleared browser and follow them to other devices. Guests keep every feature: "no sign-up
needed" stays true. Accounts are also the base for Connect Lichess and Pro later (not in this step).

## Decisions

- **Provider: Supabase** (auth + Postgres with row-level security), free tier. The client
  (`@supabase/supabase-js`) is loaded lazily, only when a session exists, a sign-in callback is in
  the URL, or someone opens the sign-up dialog, so guests download nothing extra.
- **Sign-in methods: Google, and an email that carries both a link and a 6-digit code.** No
  passwords. PKCE flow: links only finish in the browser that asked for them, so the code covers
  opening the email on another device.
- **Redirects, never pop-ups.** COOP `same-origin` (needed for multi-threaded Stockfish) cuts pop-up
  windows off from the opener. Google sign-in leaves the page and comes back to the same path.
- **Email via Resend SMTP** (free 3,000/month) from `auth@rookahead.com`; Supabase's own sender
  allows only a few emails an hour.
- Google's consent screen names `<project>.supabase.co` until a paid custom domain is worth it.

## Data

One table, one row per user per store:

| column | |
|---|---|
| `user_id` | `auth.uid()` by default, cascades on account deletion |
| `key` | `settings` · `puzzles` · `games` · `reviews` |
| `data` | the store's JSON, as kept in localStorage (under 2 MB) |
| `rev` | bumped on every write; writes are conditional on the rev the client last saw |
| `updated_at` | server time of the last write |

RLS: a user reads and writes only their own rows. `delete_account()` (security definer) deletes the
caller from `auth.users`; their rows go with it. Schema in `supabase/schema.sql`.

Synced localStorage keys: `rookahead.settings.v2`, `rookahead.puzzles.v1`, `rookahead.games.v1`,
`rookahead.reviews.v1`. Not synced: the game in progress, play setup, session hand-off, sidebar.

## Sync

Sync state lives in `rookahead.sync.v1`: the user id it belongs to, the last-seen rev per key, and
dirty keys with the time they changed locally.

A sync pass: fetch every remote `(key, rev)`. Per key:
- no remote row and local data → insert;
- remote rev = last seen → push if dirty (`update … where rev = last seen`);
- remote rev newer → fetch it; if local is dirty or never synced, merge, else take remote; write
  locally; push the merge if it differs from remote.
A failed conditional write (someone else wrote first) repeats the key, up to three times.

Passes run when the app starts signed in, after sign-in, 2 s after a local change, when the tab
becomes visible (at most every 30 s), and when the browser comes back online. One pass at a time.
Pages holding a store in React state reload it when a pass changes that store locally.

A different user signing in on a device treats all local data as never synced (it merges in).
Logging out deletes the synced keys and sync state from the device; the data stays in the account.

Merges (pure, in `syncMerge.ts`):
- **games**: union by id, newest first, 200 kept.
- **reviews**: union by key, newer `at` wins, 300 kept.
- **puzzles**: rating/played/solved/streak/prefs from the side with more puzzles played (tie →
  local); best streak and Sprint bests take the max; seen and solved-mistake ids are unioned; the day
  streak with the later last day (same day → higher count, best = max); the later daily result;
  the puzzle on the board stays local.
- **settings**: the side changed more recently wins (guest data counts as oldest); the engine choice
  stays local (it's about the device).

## UI

- **User card (sidebar foot)**: guest → "Guest" / "Sign up" link opening the dialog (rail: the `?`
  avatar opens it). Signed in → avatar (Google photo, else initial), name, sync line ("Synced",
  "Saving…", "Offline").
- **Account page** (`/signup`, `/login`; replaced the first-draft dialog at the user's request):
  left half brand panel (logo, "Review every game. Train every day.", four features), right half
  Sign in / Register tabs. Register asks for a **username** first (3–20 letters, digits, `_`, `-`;
  unique ignoring case; fixed once chosen; checked live via `username_available`), then Google or
  email. Sign in doesn't create accounts by email. Signed in without a username (e.g. Google from
  Sign in) → "Choose your username" step. `?next=` brings you back; "Not now, continue as a guest".
  Usernames live in `profiles` (see schema).
- **Settings → Account** (top of the panel): guest → one line + Sign up; signed in → name, email,
  Log out, Delete account (confirm).
- Phones reach all of this through the header avatar → Settings.
- No sign-up configured (env vars missing) → none of this UI shows.

## Errors

Network failures leave keys dirty; the next pass retries; the card says "Offline". Auth errors in
the dialog are shown inline. A callback with an error in the URL opens the dialog with the message.

## Privacy page

Add what an account stores (email, name, avatar URL from Google, the four stores), where (Supabase,
EU or US region per project), who sends email (Resend), and how to delete it.

## Testing

Unit tests for the merges and the sync pass (fake remote, fake storage). The Supabase adapter and
the UI are checked by hand on the preview branch against the real project.

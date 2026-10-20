# Full Stockfish on the website (R2)

The Full networks (`stockfish-19.wasm`, `stockfish-19-single.wasm`, ~99 MB each) are over Cloudflare
Pages' 25 MiB per-file limit. They live in an R2 bucket instead, and `functions/engine/[file].ts`
streams them from the site's own address (cross-origin isolation needs same-origin files).
`public/_routes.json` sends only those two paths to the function, so nothing else uses Functions requests.

The bucket is set up and bound (2026-10-20). Setting `VITE_LITE_ONLY=true` in `.env.web` goes back to Lite only.

## One-time setup

1. **Turn on R2.** Cloudflare dashboard → R2 Object Storage. The free tier covers this easily
   (10 GB storage, 10 M reads a month, downloads always free); Cloudflare may ask for a card first.
2. **Make the bucket** `rookahead-engine`.
3. **Upload the two files** (from `node_modules/stockfish/bin/` or `public/engine/`), keeping their names:
   - in the dashboard: open the bucket → Upload, or
   - with Wrangler: `npx wrangler login`, then
     `npx wrangler r2 object put rookahead-engine/stockfish-19.wasm --file public/engine/stockfish-19.wasm --remote`
     (and the same for `stockfish-19-single.wasm`).
4. **Bind it to the site.** Workers & Pages → rookahead → Settings → Bindings → Add → R2 bucket:
   variable name `ENGINE`, bucket `rookahead-engine`. Add it for both Production and Preview.
5. **Offer Full on the site:** delete the `VITE_LITE_ONLY=true` line from `.env.web` and push.

## Updating Stockfish

A new `stockfish` package means new `.wasm` files: upload them over the old ones (same names).
Browsers keep a copy for a week (`Cache-Control` in the function), and the ETag tells them when it changed.

## Checking it locally

```sh
VITE_LITE_ONLY=false npx vite build --mode web --outDir /tmp/dist-full
npx wrangler r2 object put rookahead-engine/stockfish-19.wasm --file public/engine/stockfish-19.wasm --local --persist-to /tmp/r2
npx wrangler r2 object put rookahead-engine/stockfish-19-single.wasm --file public/engine/stockfish-19-single.wasm --local --persist-to /tmp/r2
npx wrangler pages dev /tmp/dist-full --r2 ENGINE=rookahead-engine --persist-to /tmp/r2
```

(Run `pages dev` from the repo root so it finds `functions/`.)

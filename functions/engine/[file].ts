// The Full Stockfish networks (~99 MB each) are over Cloudflare Pages' 25 MiB per-file limit, so they
// live in R2 (bucket bound as ENGINE) and are streamed from here: the page asks for them on its own
// origin, as cross-origin isolation requires. public/_routes.json sends only these two paths here.

interface R2Object {
  size: number
  httpEtag: string
  writeHttpMetadata(headers: Headers): void
  body?: ReadableStream
}

interface Env {
  ENGINE?: {
    get(key: string, options?: { onlyIf?: Headers }): Promise<R2Object | null>
    head(key: string): Promise<R2Object | null>
  }
}

interface Context {
  request: Request
  env: Env
  params: { file?: string | string[] }
  next(): Promise<Response>
}

const FULL = new Set(['stockfish-19.wasm', 'stockfish-19-single.wasm'])

export async function onRequest({ request, env, params, next }: Context): Promise<Response> {
  const file = String(params.file ?? '')
  const method = request.method
  if (!env.ENGINE || !FULL.has(file) || (method !== 'GET' && method !== 'HEAD')) return next()
  const object = method === 'HEAD' ? await env.ENGINE.head(file) : await env.ENGINE.get(file, { onlyIf: request.headers })
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('ETag', object.httpEtag)
  headers.set('Content-Type', 'application/wasm')
  // no-transform: left uncompressed, the length stays known and the download progress bar works.
  headers.set('Cache-Control', 'public, max-age=604800, no-transform')
  headers.set('Content-Length', String(object.size))
  if (method === 'HEAD') return new Response(null, { headers })
  // A matching If-None-Match comes back without a body: the browser's copy is current.
  if (!object.body) {
    headers.delete('Content-Length')
    return new Response(null, { status: 304, headers })
  }
  return new Response(object.body, { headers })
}

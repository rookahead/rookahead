import { useEffect, useState } from 'react'
import { Link } from '../components/Link'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { Skel } from '../components/Skeleton'
import { inApp } from '../lib/install'
import type { MoveClass } from '../lib/classify'
import { navigate, usePathname } from '../lib/router'
import type { Settings } from '../lib/settings'

/** A post as the blog's build lists it (scripts/build-blog.mjs, /blog/posts.json). */
interface Post {
  slug: string
  title: string
  description: string
  date: string
  minutes: number
  /** The post's cover: a position, with its last move and that move's verdict. */
  cover?: { fen: string; last?: [string, string]; grade?: MoveClass; flip?: boolean }
}

const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

let cached: Post[] | null = null

/**
 * Phones' Blog tab: the posts, and a post opened in the app (the blog's own page in a frame, showing just the post).
 * Desktop has the blog itself, at the same addresses.
 */
export function BlogPage({ settings }: { settings: Settings }) {
  const slug = /^\/blog\/([a-z0-9-]+)\/?$/.exec(usePathname())?.[1]
  const [posts, setPosts] = useState(cached)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (cached) return
    fetch('/blog/posts.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: Post[]) => setPosts((cached = list)))
      .catch(() => setFailed(true))
  }, [])

  // A link in a post: another post opens here, the rest of the site in the app, and other sites outside it.
  useEffect(() => {
    const open = (e: MessageEvent) => {
      const href = e.origin === location.origin && (e.data as { rookaheadOpen?: unknown })?.rookaheadOpen
      if (typeof href !== 'string') return
      const url = new URL(href)
      if (url.origin === location.origin) navigate(url.pathname + url.search + url.hash)
      else if (inApp()) location.assign(url.href)
      else window.open(url.href, '_blank', 'noopener')
    }
    window.addEventListener('message', open)
    return () => window.removeEventListener('message', open)
  }, [])

  if (slug) {
    const post = posts?.find((p) => p.slug === slug)
    return (
      <div className="blog-page reading">
        <PageHeader back="/blog" phoneTitle={post?.title ?? 'Blog'} />
        <iframe key={slug} className="blog-frame" src={`/blog/${slug}`} title={post?.title ?? 'Post'} />
      </div>
    )
  }

  return (
    <div className="blog-page">
      <PageHeader phoneOnly />
      <div className="blog-list">
        <h1 className="blog-heading">Blog</h1>
        {failed && <p className="blog-note">The posts didn’t load. Check your connection.</p>}
        {!posts && !failed && [0, 1, 2].map((i) => <Skel key={i} className={`home-card blog-card-skel ${i ? '' : 'latest'}`} />)}
        {/* The newest post is the big one, its board over the words; the rest have theirs beside. */}
        {posts?.map((post, i) => (
          <Link key={post.slug} to={`/blog/${post.slug}`} className={`home-card blog-card ${i ? '' : 'latest'}`}>
            {post.cover && (
              <span className="blog-card-board">
                <MiniBoard fen={post.cover.fen} orientation={post.cover.flip ? 'black' : 'white'} theme={settings.boardTheme} lastMove={post.cover.last} grade={post.cover.grade} label={post.title} />
              </span>
            )}
            <span className="blog-card-text">
              <span className="blog-card-meta">
                {i ? '' : 'Latest · '}
                {day(post.date)} · {post.minutes} min read
              </span>
              <strong>{post.title}</strong>
              <span className="blog-card-desc">{post.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

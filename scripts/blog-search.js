// The blog's search box (copied to /blog/search.js by build-blog.mjs): Ctrl K, ⌘K or / opens it, and it
// looks through every post's text (/blog/search.json, fetched the first time it's wanted). Each result is
// a post, or a section of one, with the words you typed marked.
;(function () {
  var dialog = document.querySelector('dialog.search')
  var input = dialog.querySelector('input')
  var list = dialog.querySelector('.results')
  var posts = null
  var loading = null
  var active = 0

  function load() {
    loading =
      loading ||
      fetch('/blog/search.json')
        .then(function (r) {
          return r.json()
        })
        .then(function (data) {
          posts = data
          render()
        })
        .catch(function () {
          loading = null
        })
    return loading
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function count(text, terms) {
    var lower = text.toLowerCase()
    var n = 0
    for (var i = 0; i < terms.length; i++) if (lower.indexOf(terms[i]) >= 0) n++
    return n
  }

  /** The words you typed, marked in the text. */
  function mark(text, terms) {
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }).join('|') + ')', 'gi')
    return esc(text).replace(re, '<mark>$1</mark>')
  }

  /** A line of the text around the first word you typed. */
  function snippet(text, terms) {
    var lower = text.toLowerCase()
    var at = -1
    for (var i = 0; i < terms.length && at < 0; i++) at = lower.indexOf(terms[i])
    if (at < 0) return text.slice(0, 120)
    var start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 40)) + 1)
    var end = start + 140 < text.length ? text.lastIndexOf(' ', start + 140) : text.length
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  }

  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length)
      return posts.map(function (p) {
        return { href: '/blog/' + p.slug, title: esc(p.title), sub: esc(p.description) }
      })
    var found = []
    posts.forEach(function (p, order) {
      var kept = 0
      p.sections.forEach(function (s) {
        var all = p.title + ' ' + s.heading + ' ' + (s.id ? '' : p.description + ' ') + s.text
        if (count(all, terms) < terms.length || kept >= 3) return
        kept++
        var score = count(p.title, terms) * 6 + count(s.heading, terms) * 3 + (s.id ? 0 : 1) - order * 0.01
        var body = s.id ? s.text : p.description + ' ' + s.text
        found.push({
          href: '/blog/' + p.slug + (s.id ? '#' + s.id : ''),
          title: mark(p.title, terms) + (s.heading ? '<span class="r-sep">›</span>' + mark(s.heading, terms) : ''),
          sub: mark(snippet(body, terms), terms),
          score: score,
        })
      })
    })
    return found
      .sort(function (a, b) {
        return b.score - a.score
      })
      .slice(0, 8)
  }

  function render() {
    if (!posts) return
    var q = input.value.trim()
    var results = search(q)
    active = 0
    list.innerHTML = results.length
      ? results
          .map(function (r, i) {
            return '<li role="option"' + (i === 0 ? ' aria-selected="true"' : '') + '><a href="' + r.href + '"><span class="r-title">' + r.title + '</span><span class="r-sub">' + r.sub + '</span></a></li>'
          })
          .join('')
      : '<li class="r-none">Nothing found for “' + esc(q) + '”</li>'
  }

  function select(i) {
    var items = list.querySelectorAll('[role="option"]')
    if (!items.length) return
    active = (i + items.length) % items.length
    items.forEach(function (el, n) {
      if (n === active) el.setAttribute('aria-selected', 'true')
      else el.removeAttribute('aria-selected')
    })
    items[active].scrollIntoView({ block: 'nearest' })
  }

  function open() {
    if (dialog.open) return
    load()
    dialog.showModal()
    input.select()
  }

  document.querySelectorAll('[data-search-open]').forEach(function (b) {
    b.addEventListener('click', open)
    b.addEventListener('pointerenter', load, { once: true })
  })

  addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
      e.preventDefault()
      open()
    }
  })

  input.addEventListener('input', render)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      select(active + (e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      var link = list.querySelector('[aria-selected="true"] a')
      if (link) link.click()
    }
  })

  // A result on this same page only moves to its section, so close the box for it.
  list.addEventListener('click', function (e) {
    if (e.target.closest('a')) dialog.close()
  })

  // A click on the dimmed page around the box closes it.
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close()
  })
})()

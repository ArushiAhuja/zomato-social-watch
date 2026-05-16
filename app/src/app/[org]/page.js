'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/auth'

const SOURCES = ['reddit', 'hackernews', 'google_news', 'twitter', 'playstore']

const SOURCE_COLORS = {
  reddit: '#f87171',
  hackernews: '#3b82f6',
  google_news: '#4ade80',
  twitter: '#60a5fa',
  playstore: '#9b8ff7',
}

const SOURCE_LABELS = {
  reddit: 'reddit',
  hackernews: 'hn',
  google_news: 'news',
  twitter: 'twitter',
  playstore: 'play',
}

function ScorePill({ score }) {
  const s = Number(score) || 0
  const style =
    s >= 80
      ? { color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }
      : s >= 60
      ? { color: '#818cf8', background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)' }
      : { color: '#334155', background: '#191d2b', border: '1px solid #1e2535' }

  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 7px',
      borderRadius: 99,
      flexShrink: 0,
      minWidth: 36,
      textAlign: 'center',
      ...style,
    }}>
      {s}
    </span>
  )
}

function SourceDot({ source }) {
  const color = SOURCE_COLORS[source] || '#64748b'
  const label = SOURCE_LABELS[source] || source
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>{label}</span>
    </div>
  )
}

function CategoryPill({ name, color }) {
  if (!name) return <span style={{ fontSize: 11, color: '#334155' }}>—</span>
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 99,
      whiteSpace: 'nowrap',
      flexShrink: 0,
      background: (color || '#9b8ff7') + '22',
      color: color || '#9b8ff7',
      border: `1px solid ${(color || '#9b8ff7')}44`,
    }}>
      {name}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 24px',
      borderBottom: '1px solid #1e2535',
      borderLeft: '2px solid transparent',
    }}>
      <div className="skeleton" style={{ width: 36, height: 20, borderRadius: 99 }} />
      <div className="skeleton" style={{ width: 50, height: 12, borderRadius: 4 }} />
      <div className="skeleton" style={{ flex: 1, height: 13, borderRadius: 4 }} />
      <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 99 }} />
      <div className="skeleton" style={{ width: 40, height: 12, borderRadius: 4 }} />
      <div className="skeleton" style={{ width: 18, height: 18, borderRadius: 4 }} />
    </div>
  )
}

function HeaderSourceDot({ source, count }) {
  const color = SOURCE_COLORS[source] || '#64748b'
  const label = SOURCE_LABELS[source] || source
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
        {label} {count}
      </span>
    </div>
  )
}

export default function FeedPage({ params }) {
  const slug = params.org
  const router = useRouter()

  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const [filterSource, setFilterSource] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterEscalated, setFilterEscalated] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getPosts(slug, {
        source: filterSource || undefined,
        category_id: filterCategory || undefined,
        escalated: filterEscalated ? true : undefined,
        search: search || undefined,
        page,
        limit: 50,
      })
      setPosts(data.posts || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch (err) {
      if (err.message === 'unauthorized') router.replace('/login')
      else setError(err.message || 'failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [slug, filterSource, filterCategory, filterEscalated, search, page, router])

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getStatus(slug)
      setStatus(s)
    } catch {
      // non-critical
    }
  }, [slug])

  useEffect(() => {
    fetchPosts()
    fetchStatus()
  }, [fetchPosts, fetchStatus])

  // Auto-refresh on page load if data is stale — mirrors original Express scheduler
  // which called runOrgCycle immediately on startup, no cron needed.
  useEffect(() => {
    const key = `spill:lastRefresh:${slug}`
    const last = parseInt(sessionStorage.getItem(key) || '0', 10)
    const staleMs = 5 * 60 * 1000 // 5 minutes
    if (Date.now() - last > staleMs) {
      sessionStorage.setItem(key, String(Date.now()))
      api.triggerRefresh(slug).catch(() => {})
    }
  }, [slug])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await api.triggerRefresh(slug)
      await fetchPosts()
      await fetchStatus()
    } catch (err) {
      if (err.message === 'unauthorized') router.replace('/login')
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleReviewed(post) {
    try {
      await api.updatePost(slug, post.id, { reviewed: !post.reviewed })
      setPosts(prev =>
        prev.map(p => (p.id === post.id ? { ...p, reviewed: !p.reviewed } : p))
      )
    } catch {
      // silently fail
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const sourceBreakdown = status?.sourceBreakdown || {}
  const totalEscalated = status?.totalEscalated ?? 0

  const filterPillBase = {
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 99,
    border: '1px solid #1e2535',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.12s ease',
  }

  const filterPillActive = {
    ...filterPillBase,
    background: '#3b82f6',
    border: '1px solid #3b82f6',
    color: '#0d0f1a',
    fontWeight: 500,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky',
        top: 0,
        background: '#0d0f1a',
        borderBottom: '1px solid #1e2535',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 52,
        zIndex: 30,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#334155', letterSpacing: '0.05em' }}>feed</span>
          {status?.lastRefresh && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                watching
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* source breakdown dots */}
          {Object.keys(sourceBreakdown).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {Object.entries(sourceBreakdown).map(([src, count]) => (
                <HeaderSourceDot key={src} source={src} count={count} />
              ))}
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#64748b',
              background: 'transparent',
              border: '1px solid #1e2535',
              borderRadius: 8,
              padding: '5px 12px',
              fontFamily: 'inherit',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { if (!refreshing) { e.currentTarget.style.borderColor = '#243047'; e.currentTarget.style.color = '#e2e8f0' }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2535'; e.currentTarget.style.color = '#64748b' }}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            refresh
          </button>

          {status?.lastRefresh && (
            <span style={{ fontSize: 11, color: '#334155', fontFamily: 'var(--font-mono)' }}>
              {timeAgo(status.lastRefresh)}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        padding: '10px 24px',
        borderBottom: '1px solid #1e2535',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {/* Source filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => { setFilterSource(''); setPage(1) }}
            style={!filterSource ? filterPillActive : filterPillBase}
            onMouseEnter={e => { if (filterSource) { e.currentTarget.style.borderColor = '#243047'; e.currentTarget.style.color = '#e2e8f0' }}}
            onMouseLeave={e => { if (filterSource) { e.currentTarget.style.borderColor = '#1e2535'; e.currentTarget.style.color = '#64748b' }}}
          >
            all
          </button>
          {SOURCES.map(src => (
            <button
              key={src}
              onClick={() => { setFilterSource(src === filterSource ? '' : src); setPage(1) }}
              style={filterSource === src ? { ...filterPillActive, background: SOURCE_COLORS[src] + '22', border: `1px solid ${SOURCE_COLORS[src]}66`, color: SOURCE_COLORS[src] } : filterPillBase}
              onMouseEnter={e => { if (filterSource !== src) { e.currentTarget.style.borderColor = '#243047'; e.currentTarget.style.color = '#e2e8f0' }}}
              onMouseLeave={e => { if (filterSource !== src) { e.currentTarget.style.borderColor = '#1e2535'; e.currentTarget.style.color = '#64748b' }}}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: SOURCE_COLORS[src] || '#64748b', display: 'inline-block' }} />
                {SOURCE_LABELS[src] || src}
              </span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { setFilterEscalated(!filterEscalated); setPage(1) }}
          style={filterEscalated
            ? { ...filterPillBase, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.4)', color: '#3b82f6' }
            : filterPillBase
          }
          onMouseEnter={e => { if (!filterEscalated) { e.currentTarget.style.borderColor = '#243047'; e.currentTarget.style.color = '#e2e8f0' }}}
          onMouseLeave={e => { if (!filterEscalated) { e.currentTarget.style.borderColor = '#1e2535'; e.currentTarget.style.color = '#64748b' }}}
        >
          escalated only
        </button>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex' }}>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="search..."
            style={{
              width: 180,
              fontSize: 12,
              padding: '5px 12px',
              height: 30,
              borderRadius: 8,
            }}
          />
        </form>
      </div>

      {/* Stats bar */}
      <div style={{
        padding: '7px 24px',
        borderBottom: '1px solid #1e2535',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
          {total} signals
        </span>
        {totalEscalated > 0 && (
          <span style={{ fontSize: 11.5, color: '#3b82f6', fontFamily: 'var(--font-mono)' }}>
            {totalEscalated} escalated
          </span>
        )}
        {status?.lastRefresh && (
          <span style={{ fontSize: 11, color: '#334155', fontFamily: 'var(--font-mono)' }}>
            last seen {timeAgo(status.lastRefresh)}
          </span>
        )}
      </div>

      {/* Feed */}
      <div className="scrollbar-thin" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Loading skeletons */}
        {loading && (
          <div>
            {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#f87171' }}>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && posts.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 8 }}>
            <div style={{ fontSize: 15, color: '#64748b', fontWeight: 400 }}>quiet internet day.</div>
            <div style={{ fontSize: 13, color: '#334155' }}>probably a good sign. check back soon.</div>
          </div>
        )}

        {/* Post rows */}
        {!loading && !error && posts.length > 0 && (
          <div>
            {posts.map(post => {
              const timeStr = post.post_created_at
                ? timeAgo(post.post_created_at)
                : post.fetched_at
                ? timeAgo(post.fetched_at)
                : '—'
              return (
                <div
                  key={post.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 24px',
                    borderBottom: '1px solid #1e2535',
                    borderLeft: post.escalated ? '2px solid #3b82f6' : '2px solid transparent',
                    background: post.escalated ? 'rgba(59,130,246,0.03)' : 'transparent',
                    transition: 'background 0.1s',
                    opacity: post.reviewed ? 0.45 : 1,
                  }}
                  onMouseEnter={e => { if (!post.reviewed) e.currentTarget.style.background = post.escalated ? 'rgba(59,130,246,0.06)' : '#13161f' }}
                  onMouseLeave={e => e.currentTarget.style.background = post.escalated ? 'rgba(59,130,246,0.03)' : 'transparent'}
                >
                  {/* score pill */}
                  <ScorePill score={post.escalation_score} />

                  {/* source dot */}
                  <SourceDot source={post.source} />

                  {/* title */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 13.5,
                        color: '#e2e8f0',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#3b82f6'}
                      onMouseLeave={e => e.currentTarget.style.color = '#e2e8f0'}
                      title={post.title || post.body}
                    >
                      {post.title || post.body?.slice(0, 80) || '(no title)'}
                    </a>
                    {post.author && (
                      <div style={{ fontSize: 11, color: '#334155', marginTop: 1 }}>{post.author}</div>
                    )}
                  </div>

                  {/* category pill */}
                  <CategoryPill name={post.category_name} color={post.category_color} />

                  {/* time */}
                  <span style={{
                    fontSize: 11,
                    color: '#334155',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: 'right',
                  }}>
                    {timeStr}
                  </span>

                  {/* reviewed toggle */}
                  <button
                    onClick={() => toggleReviewed(post)}
                    title={post.reviewed ? 'mark unreviewed' : 'mark reviewed'}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `1px solid ${post.reviewed ? '#3b82f6' : '#243047'}`,
                      background: post.reviewed ? '#3b82f6' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => { if (!post.reviewed) e.currentTarget.style.borderColor = '#3b82f6' }}
                    onMouseLeave={e => { if (!post.reviewed) e.currentTarget.style.borderColor = '#243047' }}
                  >
                    {post.reviewed && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 3" stroke="#0d0f1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 24px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                fontSize: 12,
                color: '#64748b',
                background: 'transparent',
                border: '1px solid #1e2535',
                borderRadius: 8,
                padding: '5px 14px',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.4 : 1,
                fontFamily: 'inherit',
                transition: 'all 0.12s',
              }}
            >
              prev
            </button>
            <span style={{ fontSize: 11.5, color: '#334155', fontFamily: 'var(--font-mono)' }}>
              {page} / {pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              style={{
                fontSize: 12,
                color: '#64748b',
                background: 'transparent',
                border: '1px solid #1e2535',
                borderRadius: 8,
                padding: '5px 14px',
                cursor: page === pages ? 'not-allowed' : 'pointer',
                opacity: page === pages ? 0.4 : 1,
                fontFamily: 'inherit',
                transition: 'all 0.12s',
              }}
            >
              next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

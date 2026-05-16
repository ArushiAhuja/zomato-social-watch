'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { api } from '@/lib/api'
import { getUser, removeToken } from '@/lib/auth'

const NAV_ITEMS = [
  { label: 'feed', href: (org) => `/${org}`, icon: '◈' },
  { label: 'settings', href: (org) => `/${org}/settings`, icon: '◇' },
  { label: 'categories', href: (org) => `/${org}/categories`, icon: '◉' },
  { label: 'escalations', href: (org) => `/${org}/escalations`, icon: '◎' },
]

export default function OrgNav({ slug }) {
  const router = useRouter()
  const pathname = usePathname()
  const [orgs, setOrgs] = useState([])
  const [currentOrg, setCurrentOrg] = useState(null)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [user, setUser] = useState(null)
  const switcherRef = useRef(null)

  useEffect(() => {
    setUser(getUser())
    async function load() {
      try {
        const [allOrgs, orgData] = await Promise.all([
          api.getOrgs(),
          api.getOrg(slug),
        ])
        setOrgs(allOrgs || [])
        setCurrentOrg(orgData)
      } catch {
        // silently fail — don't block the nav
      }
    }
    load()
  }, [slug])

  useEffect(() => {
    function handleClickOutside(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setShowSwitcher(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function signOut() {
    removeToken()
    router.push('/login')
  }

  function isActive(hrefFn) {
    const resolved = hrefFn(slug)
    if (resolved === `/${slug}`) return pathname === resolved
    return pathname.startsWith(resolved)
  }

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: 208,
      background: '#12151e',
      borderRight: '1px solid #1e2535',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
    }}>
      {/* Logo + org switcher */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1e2535' }}>
        <div style={{
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: '0.25em',
          color: '#64748b',
          marginBottom: 12,
        }}>
          spill
        </div>

        {/* org switcher */}
        <div ref={switcherRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSwitcher(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              background: showSwitcher ? '#191d2b' : 'transparent',
              border: '1px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!showSwitcher) e.currentTarget.style.background = '#191d2b' }}
            onMouseLeave={e => { if (!showSwitcher) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#e2e8f0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {currentOrg?.name || slug}
            </span>
            <span style={{ fontSize: 10, color: '#334155', marginLeft: 4 }}>⌄</span>
          </button>

          {showSwitcher && (
            <div style={{
              marginTop: 4,
              background: '#191d2b',
              border: '1px solid #1e2535',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {orgs.map(org => (
                <button
                  key={org.id}
                  onClick={() => { router.push(`/${org.slug}`); setShowSwitcher(false) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: org.slug === slug ? '#1e2338' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    color: org.slug === slug ? '#e2e8f0' : '#64748b',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (org.slug !== slug) e.currentTarget.style.background = '#1e2338' }}
                  onMouseLeave={e => { if (org.slug !== slug) e.currentTarget.style.background = 'transparent' }}
                >
                  {org.name}
                </button>
              ))}
              <div style={{ borderTop: '1px solid #1e2535' }}>
                <button
                  onClick={() => { router.push('/onboarding'); setShowSwitcher(false) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    color: '#3b82f6',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1e2338'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  + new workspace
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              href={item.href(slug)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                marginBottom: 2,
                color: active ? '#e2e8f0' : '#64748b',
                background: active ? '#1e2338' : 'transparent',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                transition: 'all 0.12s ease',
                textDecoration: 'none',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.background = '#191d2b'
                  e.currentTarget.style.color = '#e2e8f0'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#64748b'
                }
              }}
            >
              <span style={{ fontSize: 10, opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* User + sign out */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1e2535' }}>
        <div style={{
          fontSize: 11.5,
          color: '#334155',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 8,
        }}>
          {user?.email || ''}
        </div>
        <button
          onClick={signOut}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: 0,
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
        >
          sign out
        </button>
      </div>
    </nav>
  )
}

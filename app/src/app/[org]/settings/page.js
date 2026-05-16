'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const SOURCE_COLORS = {
  reddit: '#f87171',
  hackernews: '#3b82f6',
  google_news: '#4ade80',
  twitter: '#60a5fa',
  playstore: '#9b8ff7',
  youtube: '#f87171',
}

const ALL_SOURCES = [
  { id: 'reddit', label: 'Reddit', desc: 'posts, comments & discussions' },
  { id: 'hackernews', label: 'Hacker News', desc: 'show HN, ask HN, discussions' },
  { id: 'google_news', label: 'Google News', desc: 'news articles and press coverage' },
  { id: 'twitter', label: 'Twitter/X', desc: 'tweets and threads' },
  { id: 'playstore', label: 'Play Store', desc: 'app store reviews' },
  { id: 'youtube', label: 'YouTube', desc: 'comments', disabled: true },
]

function SourceCard({ slug, sourceInfo, sourceData, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [localData, setLocalData] = useState(() => ({
    enabled: sourceData?.enabled || false,
    config: { ...(sourceData?.config || {}) },
    credentials: { ...(sourceData?.credentials || {}) },
  }))

  const color = SOURCE_COLORS[sourceInfo.id] || '#64748b'

  async function handleToggle(val) {
    const updated = { ...localData, enabled: val }
    setLocalData(updated)
    if (val) setExpanded(true)
    try {
      await api.updateSource(slug, sourceInfo.id, { enabled: val })
      onUpdate()
    } catch {
      setLocalData((prev) => ({ ...prev, enabled: !val }))
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      await api.updateSource(slug, sourceInfo.id, {
        enabled: localData.enabled,
        config: localData.config,
        credentials: localData.credentials,
      })
      setSaveMsg('saved')
      onUpdate()
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (err) {
      setSaveMsg(err.message || 'error saving')
    } finally {
      setSaving(false)
    }
  }

  function setConfigField(key, val) {
    setLocalData((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: val },
    }))
  }

  function setCredField(key, val) {
    setLocalData((prev) => ({
      ...prev,
      credentials: { ...prev.credentials, [key]: val },
    }))
  }

  const queriesValue = Array.isArray(localData.config?.queries)
    ? localData.config.queries.join('\n')
    : localData.config?.queries || ''

  const rssValue = Array.isArray(localData.config?.rss_urls)
    ? localData.config.rss_urls.join('\n')
    : localData.config?.rss_urls || ''

  const appIdsValue = Array.isArray(localData.config?.app_ids)
    ? localData.config.app_ids.join('\n')
    : localData.config?.app_ids || ''

  const hasNoCreds = sourceInfo.id === 'hackernews' || sourceInfo.id === 'google_news' || sourceInfo.id === 'playstore'

  return (
    <div style={{
      border: '1px solid #1e2535',
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
      opacity: sourceInfo.disabled ? 0.45 : 1,
      transition: 'border-color 0.15s',
      ...(localData.enabled ? { borderColor: color + '44' } : {}),
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
      }}>
        <button
          onClick={() => !sourceInfo.disabled && setExpanded((v) => !v)}
          disabled={sourceInfo.disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'none',
            border: 'none',
            cursor: sourceInfo.disabled ? 'default' : 'pointer',
            fontFamily: 'inherit',
            flex: 1,
            textAlign: 'left',
          }}
        >
          {/* colored dot */}
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: localData.enabled ? color : '#1e2535',
            flexShrink: 0,
            transition: 'background 0.2s',
          }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: '#e2e8f0' }}>{sourceInfo.label}</span>
              {sourceInfo.disabled && (
                <span style={{
                  fontSize: 10,
                  color: '#334155',
                  border: '1px solid #1e2535',
                  borderRadius: 99,
                  padding: '1px 7px',
                  letterSpacing: '0.05em',
                }}>
                  coming soon
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{sourceInfo.desc}</div>
          </div>
        </button>

        {/* Toggle */}
        <button
          onClick={() => !sourceInfo.disabled && handleToggle(!localData.enabled)}
          disabled={sourceInfo.disabled}
          style={{ background: 'none', border: 'none', padding: 0, cursor: sourceInfo.disabled ? 'not-allowed' : 'pointer' }}
        >
          <div className={`toggle-track ${localData.enabled ? 'on' : ''}`}>
            <div className="toggle-thumb" />
          </div>
        </button>
      </div>

      {/* Expanded content */}
      {localData.enabled && expanded && !sourceInfo.disabled && (
        <div style={{
          borderTop: '1px solid #1e2535',
          padding: '16px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: '#13161f',
        }}>
          {/* Credential fields */}
          {sourceInfo.id === 'reddit' && (
            <>
              <div style={{
                fontSize: 11,
                color: '#94a3b8',
                background: 'rgba(148,163,184,0.07)',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 8,
                padding: '8px 12px',
              }}>
                heads up: these credentials are stored unencrypted.
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>client id</div>
                <input
                  type="text"
                  value={localData.credentials?.client_id || ''}
                  onChange={(e) => setCredField('client_id', e.target.value)}
                  placeholder="Reddit client ID"
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>client secret</div>
                <input
                  type="password"
                  value={localData.credentials?.client_secret || ''}
                  onChange={(e) => setCredField('client_secret', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
          {sourceInfo.id === 'twitter' && (
            <>
              <div style={{
                fontSize: 11,
                color: '#94a3b8',
                background: 'rgba(148,163,184,0.07)',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 8,
                padding: '8px 12px',
              }}>
                heads up: these credentials are stored unencrypted.
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>bearer token</div>
                <input
                  type="password"
                  value={localData.credentials?.bearer_token || ''}
                  onChange={(e) => setCredField('bearer_token', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
          {hasNoCreds && (
            <div style={{ fontSize: 12, color: '#334155' }}>no credentials needed for this source.</div>
          )}

          {/* Config fields */}
          {sourceInfo.id !== 'playstore' && sourceInfo.id !== 'youtube' && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                {sourceInfo.id === 'google_news' ? 'rss urls' : 'search queries'}
              </div>
              <textarea
                rows={4}
                value={sourceInfo.id === 'google_news' ? rssValue : queriesValue}
                onChange={(e) => {
                  const lines = e.target.value.split('\n')
                  if (sourceInfo.id === 'google_news') {
                    setConfigField('rss_urls', lines)
                  } else {
                    setConfigField('queries', lines)
                  }
                }}
                placeholder="one per line"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          )}
          {sourceInfo.id === 'playstore' && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>app ids</div>
              <textarea
                rows={3}
                value={appIdsValue}
                onChange={(e) => setConfigField('app_ids', e.target.value.split('\n'))}
                placeholder="com.example.app (one per line)"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          )}

          {/* Save */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                fontSize: 12,
                padding: '6px 16px',
                background: saving ? '#1e2535' : '#3b82f6',
                color: saving ? '#334155' : '#0d0f1a',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'inherit',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'saving...' : 'save'}
            </button>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg === 'saved' ? '#4ade80' : '#f87171' }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage({ params }) {
  const slug = params.org
  const router = useRouter()
  const [org, setOrg] = useState(null)
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [orgName, setOrgName] = useState('')
  const [orgWebsite, setOrgWebsite] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgSaveMsg, setOrgSaveMsg] = useState('')

  async function load() {
    try {
      const [orgData, srcData] = await Promise.all([
        api.getOrg(slug),
        api.getSources(slug),
      ])
      setOrg(orgData)
      setSources(srcData || [])
      setOrgName(orgData.name || '')
      setOrgWebsite(orgData.website || '')
      setOrgDescription(orgData.description || '')
    } catch (err) {
      if (err.message === 'unauthorized') router.replace('/login')
      else setError(err.message || 'failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function handleOrgSave(e) {
    e.preventDefault()
    setOrgSaving(true)
    setOrgSaveMsg('')
    try {
      await api.updateOrg(slug, { name: orgName, website: orgWebsite, description: orgDescription })
      setOrgSaveMsg('saved')
      setTimeout(() => setOrgSaveMsg(''), 2000)
    } catch (err) {
      setOrgSaveMsg(err.message || 'error saving')
    } finally {
      setOrgSaving(false)
    }
  }

  function getSourceData(id) {
    return sources.find((s) => s.source === id)
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%', background: '#3b82f6',
              animation: `pulseDot 1.2s ${i * 0.18}s ease-in-out infinite`,
            }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#334155' }}>loading settings...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: 13, color: '#f87171' }}>{error}</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: '#e2e8f0', marginBottom: 4 }}>settings</div>
        <div style={{ fontSize: 12.5, color: '#64748b' }}>{org?.name}</div>
      </div>

      {/* General section */}
      <section style={{ marginBottom: 40 }}>
        <div style={{
          fontSize: 11,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: '1px solid #1e2535',
        }}>
          general
        </div>
        <form onSubmit={handleOrgSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              company name
            </div>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              website
            </div>
            <input
              type="text"
              value={orgWebsite}
              onChange={(e) => setOrgWebsite(e.target.value)}
              placeholder="https://yourcompany.com"
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              description
            </div>
            <textarea
              rows={4}
              value={orgDescription}
              onChange={(e) => setOrgDescription(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={orgSaving}
              style={{
                fontSize: 12.5,
                padding: '8px 20px',
                background: orgSaving ? '#1e2535' : '#3b82f6',
                color: orgSaving ? '#334155' : '#0d0f1a',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'inherit',
                fontWeight: 500,
                cursor: orgSaving ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {orgSaving ? 'saving...' : 'save changes'}
            </button>
            {orgSaveMsg && (
              <span style={{ fontSize: 12, color: orgSaveMsg === 'saved' ? '#4ade80' : '#f87171' }}>
                {orgSaveMsg}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Sources section */}
      <section>
        <div style={{
          fontSize: 11,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: '1px solid #1e2535',
        }}>
          sources
        </div>
        {ALL_SOURCES.map((src) => (
          <SourceCard
            key={src.id}
            slug={slug}
            sourceInfo={src}
            sourceData={getSourceData(src.id)}
            onUpdate={load}
          />
        ))}
      </section>
    </div>
  )
}

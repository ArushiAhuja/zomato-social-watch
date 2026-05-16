const BASE = '/api'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('spill_token')
}

async function request(method, path, body) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('spill_token')
      window.location.href = '/login'
    }
    throw new Error('unauthorized')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  // Auth
  signup: (body) => request('POST', '/auth/signup', body),
  login: (body) => request('POST', '/auth/login', body),

  // Orgs
  getOrgs: () => request('GET', '/orgs'),
  createOrg: (body) => request('POST', '/orgs', body),
  getOrg: (slug) => request('GET', `/orgs/${slug}`),
  updateOrg: (slug, body) => request('PATCH', `/orgs/${slug}`, body),

  // Sources
  getSources: (slug) => request('GET', `/orgs/${slug}/sources`),
  updateSource: (slug, source, body) => request('PATCH', `/orgs/${slug}/sources/${source}`, body),

  // Categories
  getCategories: (slug) => request('GET', `/orgs/${slug}/categories`),
  createCategory: (slug, body) => request('POST', `/orgs/${slug}/categories`, body),
  updateCategory: (slug, id, body) => request('PATCH', `/orgs/${slug}/categories/${id}`, body),
  deleteCategory: (slug, id) => request('DELETE', `/orgs/${slug}/categories/${id}`),

  // Escalations
  getEscalations: (slug) => request('GET', `/orgs/${slug}/escalations`),
  createEscalation: (slug, body) => request('POST', `/orgs/${slug}/escalations`, body),
  updateEscalation: (slug, id, body) => request('PATCH', `/orgs/${slug}/escalations/${id}`, body),
  deleteEscalation: (slug, id) => request('DELETE', `/orgs/${slug}/escalations/${id}`),

  // Posts
  getPosts: (slug, params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
    ).toString()
    return request('GET', `/orgs/${slug}/posts${qs ? `?${qs}` : ''}`)
  },
  updatePost: (slug, id, body) => request('PATCH', `/orgs/${slug}/posts/${id}`, body),
  getStatus: (slug) => request('GET', `/orgs/${slug}/status`),
  triggerRefresh: (slug) => request('POST', `/orgs/${slug}/refresh`),

  // Onboarding
  onboard: (slug) => request('POST', `/orgs/${slug}/onboard`),
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const money = (n) => '$' + Math.round(n).toLocaleString('en-US')

// "22 Oct, 9:04 PM" — no seconds, no year
export const when = (ts) =>
  new Date(ts)
    .toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' am', ' AM')
    .replace(' pm', ' PM')

async function request(path, options) {
  const res = await fetch(API + path, options)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : res.statusText)
  }
  return data
}

const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const listRfqs = () => request('/rfqs')
export const getRfq = (id) => request(`/rfqs/${id}`)
export const createRfq = (body) => post('/rfqs', body)
export const submitBid = (id, body) => post(`/rfqs/${id}/bids`, body)

// live auction state; returns an unsubscribe function for useEffect cleanup
export function subscribeToRfq(id, onUpdate) {
  const source = new EventSource(`${API}/rfqs/${id}/stream`)
  source.onmessage = (e) => onUpdate(JSON.parse(e.data))
  return () => source.close()
}

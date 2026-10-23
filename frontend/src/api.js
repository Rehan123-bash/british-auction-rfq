const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const money = (n) => '$' + Math.round(n).toLocaleString('en-US')

// "22 Oct, 9:04 PM" — no seconds, no year
export const when = (ts) =>
  new Date(ts)
    .toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' am', ' AM')
    .replace(' pm', ' PM')

// "29 Oct 2026" — for date-only fields like pickup and quote validity
export const whenDay = (ts) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

async function request(path, options) {
  const res = await fetch(API + path, options)
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(typeof data.detail === 'string' ? data.detail : res.statusText)
    err.status = res.status // present = the api answered; absent = server unreachable/asleep
    throw err
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

// live auction state; returns an unsubscribe function for useEffect cleanup.
// onLive(true) on every message, onLive(false) when the connection drops.
export function subscribeToRfq(id, onUpdate, onLive) {
  const source = new EventSource(`${API}/rfqs/${id}/stream`)
  source.onmessage = (e) => {
    onLive?.(true)
    onUpdate(JSON.parse(e.data))
  }
  source.onerror = () => onLive?.(false)
  return () => source.close()
}

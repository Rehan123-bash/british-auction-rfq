import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listRfqs, money, when } from '../api'

function closesIn(iso) {
  const secs = Math.max(0, Math.floor((new Date(iso) - Date.now()) / 1000))
  if (secs < 120) return `closes in ${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `closes in ${mins} min`
  return `closes in ${Math.floor(mins / 60)}h ${mins % 60}m`
}

const TABS = ['All', 'Active', 'Upcoming', 'Closed']
const inTab = (r, tab) =>
  tab === 'All' ||
  (tab === 'Closed' ? r.status === 'Closed' || r.status === 'Force Closed' : r.status === tab)

export default function AuctionList() {
  const navigate = useNavigate()
  const [rfqs, setRfqs] = useState(null)
  const [slow, setSlow] = useState(false)
  const [tab, setTab] = useState('All')
  const [, setTick] = useState(0)

  useEffect(() => {
    document.title = 'Auctions · RFQ Auction'
  }, [])

  useEffect(() => {
    // keep retrying until the first load succeeds — the free-tier backend may be asleep
    const load = () => listRfqs().then(setRfqs).catch(() => {})
    load()
    const poll = setInterval(load, 5000)
    const tick = setInterval(() => setTick((x) => x + 1), 1000)
    const slowTimer = setTimeout(() => setSlow(true), 3000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
      clearTimeout(slowTimer)
    }
  }, [])

  if (!rfqs) {
    return (
      <p className="muted">
        {slow ? 'Waking up the server — free hosting, this can take up to a minute.' : 'Loading…'}
      </p>
    )
  }

  const open = (id) => navigate(`/rfqs/${id}`)
  const openOnKey = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(id)
    }
  }

  const shown = rfqs.filter((r) => inTab(r, tab))
  const active = rfqs.filter((r) => r.status === 'Active').length

  return (
    <>
      {rfqs.length === 0 ? (
        <p>No auctions yet — <Link to="/create">create one</Link>.</p>
      ) : (
        <>
          <p className="count">
            {rfqs.length} auction{rfqs.length === 1 ? '' : 's'} · {active} active
          </p>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={tab === t ? 'tab active' : 'tab'}
                onClick={() => setTab(t)}
              >
                {t} ({rfqs.filter((r) => inTab(r, t)).length})
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="muted">No {tab.toLowerCase()} auctions.</p>
          ) : (
            <table className="stack">
              <thead>
                <tr>
                  <th>RFQ</th>
                  <th>Status</th>
                  <th>Lowest Bid</th>
                  <th>Closes At</th>
                  <th>Forced Close</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    className="row-link"
                    role="link"
                    tabIndex={0}
                    onClick={() => open(r.id)}
                    onKeyDown={(e) => openOnKey(e, r.id)}
                  >
                    <td className="row-title">
                      <Link to={`/rfqs/${r.id}`} tabIndex={-1}>{r.name}</Link>
                      <span className="ref mono">{r.reference_id}</span>
                    </td>
                    <td className="row-pin">
                      <span className={`badge ${r.status.toLowerCase().replace(' ', '-')}`}>
                        {r.status}
                      </span>
                      {!r.british_auction && <span className="mode">Standard</span>}
                    </td>
                    <td data-label="Lowest bid">
                      {r.lowest_bid != null ? `${money(r.lowest_bid)} · ${r.lowest_carrier}` : '—'}
                    </td>
                    <td data-label="Closes">
                      {when(r.current_close_at)}
                      {r.status === 'Active' && (
                        <span className="muted"> · {closesIn(r.current_close_at)}</span>
                      )}
                    </td>
                    <td data-label="Forced close">
                      {r.british_auction ? when(r.forced_close_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  )
}

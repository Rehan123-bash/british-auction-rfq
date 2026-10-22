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
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('All')
  const [, setTick] = useState(0)

  useEffect(() => {
    listRfqs().then(setRfqs).catch((e) => setError(e.message))
    // poll so statuses flip and new lowest bids appear; ignore transient failures
    const poll = setInterval(() => listRfqs().then(setRfqs).catch(() => {}), 5000)
    const tick = setInterval(() => setTick((x) => x + 1), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  if (error) return <p className="error">Could not load RFQs: {error}</p>
  if (!rfqs) return <p>Loading…</p>

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
            <table>
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
                  <tr key={r.id} className="row-link" onClick={() => navigate(`/rfqs/${r.id}`)}>
                    <td>
                      <Link to={`/rfqs/${r.id}`}>{r.name}</Link>
                      <span className="ref">{r.reference_id}</span>
                    </td>
                    <td>
                      <span className={`badge ${r.status.toLowerCase().replace(' ', '-')}`}>
                        {r.status}
                      </span>
                      <span className="mode">{r.british_auction ? 'British' : 'Standard'}</span>
                    </td>
                    <td>
                      {r.lowest_bid != null ? `${money(r.lowest_bid)} · ${r.lowest_carrier}` : '—'}
                    </td>
                    <td>
                      {when(r.current_close_at)}
                      {r.status === 'Active' && (
                        <span className="muted"> · {closesIn(r.current_close_at)}</span>
                      )}
                    </td>
                    <td>{r.british_auction ? when(r.forced_close_at) : '—'}</td>
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

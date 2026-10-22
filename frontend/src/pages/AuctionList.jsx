import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRfqs } from '../api'

const fmt = (iso) => new Date(iso).toLocaleString()

export default function AuctionList() {
  const [rfqs, setRfqs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listRfqs().then(setRfqs).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error">Could not load RFQs: {error}</p>
  if (!rfqs) return <p>Loading…</p>
  if (rfqs.length === 0) return <p>No RFQs yet — create the first one.</p>

  return (
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
        {rfqs.map((r) => (
          <tr key={r.id}>
            <td><Link to={`/rfqs/${r.id}`}>{r.name}</Link></td>
            <td>
              <span className={`badge ${r.status.toLowerCase().replace(' ', '-')}`}>
                {r.status}
              </span>
            </td>
            <td>{r.lowest_bid ?? '—'}</td>
            <td>{fmt(r.current_close_at)}</td>
            <td>{fmt(r.forced_close_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

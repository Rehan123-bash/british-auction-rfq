import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getRfq, submitBid, subscribeToRfq } from '../api'

const fmt = (iso) => new Date(iso).toLocaleString()
const fmtDay = (iso) => new Date(iso).toLocaleDateString()

const TRIGGER_LABELS = {
  any_bid: 'any new bid',
  any_rank_change: 'any rank change',
  l1_change: 'L1 change',
}

// the sse stream replaces state every second, so this re-renders often enough to tick
function countdown(iso) {
  let s = Math.max(0, Math.floor((new Date(iso) - Date.now()) / 1000))
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export default function AuctionDetail() {
  const { id } = useParams()
  const [rfq, setRfq] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRfq(id).then(setRfq).catch((e) => setError(e.message))
    return subscribeToRfq(id, setRfq)
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!rfq) return <p>Loading…</p>

  return (
    <>
      <div className="card detail-header">
        <div>
          <h2>{rfq.name}</h2>
          <p className="muted">
            Ref {rfq.reference_id} · Pickup / service {fmtDay(rfq.service_date)}
          </p>
        </div>
        <span className={`badge ${rfq.status.toLowerCase().replace(' ', '-')}`}>
          {rfq.status}
        </span>
      </div>

      <div className="meta-grid">
        <div className="meta">
          <span className="meta-label">Closes in</span>
          {rfq.status === 'Active' ? countdown(rfq.current_close_at)
            : rfq.status === 'Upcoming' ? `starts ${fmt(rfq.bid_start_at)}`
            : 'ended'}
        </div>
        <div className="meta">
          <span className="meta-label">Closes at</span>
          {fmt(rfq.current_close_at)}
        </div>
        <div className="meta">
          <span className="meta-label">Forced close</span>
          {fmt(rfq.forced_close_at)}
        </div>
        <div className="meta">
          <span className="meta-label">Extension rule</span>
          +{rfq.extension_minutes} min on {TRIGGER_LABELS[rfq.extension_trigger]} in the
          last {rfq.trigger_window_minutes} min
        </div>
      </div>

      <section>
        <h3>Quotes</h3>
        {rfq.bids.length === 0 ? (
          <p className="muted">No quotes yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Carrier</th>
                <th>Freight</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Total</th>
                <th>Transit (days)</th>
                <th>Valid Until</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rfq.bids.map((b) => (
                <tr key={b.carrier_name}>
                  <td><strong>{b.rank}</strong></td>
                  <td>{b.carrier_name}</td>
                  <td>{b.freight_charges}</td>
                  <td>{b.origin_charges}</td>
                  <td>{b.destination_charges}</td>
                  <td><strong>{b.total}</strong></td>
                  <td>{b.transit_time_days}</td>
                  <td>{fmtDay(b.quote_valid_until)}</td>
                  <td>{fmt(b.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rfq.status === 'Active' ? (
        <BidForm rfqId={rfq.id} />
      ) : (
        <p className="muted">
          {rfq.status === 'Upcoming' ? 'Bidding has not started yet.' : 'This auction is closed.'}
        </p>
      )}

      <section>
        <h3>Activity</h3>
        {rfq.activity.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ul className="activity">
            {rfq.activity.map((e, i) => (
              <li key={i}>
                <span className={`tag ${e.type}`}>{e.type}</span>
                <span>{e.message}</span>
                <span className="muted">{fmt(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function BidForm({ rfqId }) {
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    carrier_name: '',
    freight_charges: '',
    origin_charges: '',
    destination_charges: '',
    transit_time_days: '',
    quote_valid_until: '',
  })

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const total =
    Number(form.freight_charges || 0) +
    Number(form.origin_charges || 0) +
    Number(form.destination_charges || 0)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      await submitBid(rfqId, {
        ...form,
        freight_charges: Number(form.freight_charges),
        origin_charges: Number(form.origin_charges),
        destination_charges: Number(form.destination_charges),
        transit_time_days: Number(form.transit_time_days),
        quote_valid_until: new Date(form.quote_valid_until).toISOString(),
      })
      // no local update needed: the stream pushes the new ranking within a second
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="card">
      <h3>Submit a Quote</h3>
      <form className="form bid-form" onSubmit={onSubmit}>
        <div className="row">
          <label>
            Carrier Name
            <input name="carrier_name" value={form.carrier_name} onChange={set} required />
          </label>
          <label>
            Transit Time (days)
            <input type="number" min="1" name="transit_time_days" value={form.transit_time_days} onChange={set} required />
          </label>
        </div>
        <div className="row three">
          <label>
            Freight Charges
            <input type="number" min="0" step="0.01" name="freight_charges" value={form.freight_charges} onChange={set} required />
          </label>
          <label>
            Origin Charges
            <input type="number" min="0" step="0.01" name="origin_charges" value={form.origin_charges} onChange={set} required />
          </label>
          <label>
            Destination Charges
            <input type="number" min="0" step="0.01" name="destination_charges" value={form.destination_charges} onChange={set} required />
          </label>
        </div>
        <div className="row">
          <label>
            Quote Valid Until
            <input type="date" name="quote_valid_until" value={form.quote_valid_until} onChange={set} required />
          </label>
          <p className="total-preview">Total: <strong>{total}</strong></p>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="button" type="submit">Submit Quote</button>
      </form>
    </section>
  )
}

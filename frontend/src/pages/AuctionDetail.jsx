import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRfq, money, submitBid, subscribeToRfq, when } from '../api'

const fmtDay = (iso) => new Date(iso).toLocaleDateString()

const TRIGGER_LABELS = {
  any_bid: 'any new bid',
  any_rank_change: 'any rank change',
  l1_change: 'L1 change',
}

function countdown(secs) {
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(secs % 60)}` : `${pad(m)}:${pad(secs % 60)}`
}

export default function AuctionDetail() {
  const { id } = useParams()
  const [rfq, setRfq] = useState(null)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)   // carrier whose row just changed
  const [banner, setBanner] = useState(null) // "extended to …" strip
  const prev = useRef(null)
  const [, setTick] = useState(0)

  // 1s re-render so the countdown ticks even between stream messages
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    // diff each update against the previous one to spot new bids and extensions
    const apply = (next) => {
      const last = prev.current
      if (last) {
        const seen = Object.fromEntries(last.bids.map((b) => [b.carrier_name, b.submitted_at]))
        const freshBid = next.bids.find((b) => seen[b.carrier_name] !== b.submitted_at)
        if (freshBid) {
          setFlash(freshBid.carrier_name)
          setTimeout(() => setFlash(null), 2000)
        }
        if (next.current_close_at !== last.current_close_at) {
          const ext = next.activity.find((e) => e.type === 'extension')
          const reason = ext ? ext.message.split(' — ')[1] : ''
          setBanner(`Extended to ${when(next.current_close_at)}` + (reason ? ` — ${reason}` : ''))
          setTimeout(() => setBanner(null), 5000)
        }
      }
      prev.current = next
      setRfq(next)
    }
    getRfq(id).then(apply).catch((e) => setError(e.message))
    return subscribeToRfq(id, apply)
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!rfq) return <p>Loading…</p>

  const secsLeft = Math.max(0, Math.floor((new Date(rfq.current_close_at) - Date.now()) / 1000))
  const l1 = rfq.bids[0]

  return (
    <>
      <Link to="/" className="back">← Back to auctions</Link>

      <div className="card detail-header">
        <div>
          <h2>{rfq.name}</h2>
          <p className="muted">
            {rfq.reference_id} · Pickup / service {fmtDay(rfq.service_date)}
          </p>
        </div>
        <span className={`badge ${rfq.status.toLowerCase().replace(' ', '-')}`}>
          {rfq.status}
        </span>
      </div>

      {banner && <div className="banner">{banner}</div>}

      <div className="meta-grid">
        <div className="meta">
          <span className="meta-label">Closes in</span>
          {rfq.status === 'Active' ? (
            <span className={secsLeft < 120 ? 'danger' : undefined}>{countdown(secsLeft)}</span>
          ) : rfq.status === 'Upcoming' ? (
            `starts ${when(rfq.bid_start_at)}`
          ) : (
            'ended'
          )}
        </div>
        <div className="meta">
          <span className="meta-label">Closes at</span>
          {when(rfq.current_close_at)}
        </div>
        <div className="meta">
          <span className="meta-label">Forced close</span>
          {rfq.british_auction ? when(rfq.forced_close_at) : '—'}
        </div>
        <div className="meta">
          <span className="meta-label">Extension rule</span>
          {rfq.british_auction ? (
            <>
              +{rfq.extension_minutes} min on {TRIGGER_LABELS[rfq.extension_trigger]} in the
              last {rfq.trigger_window_minutes} min
            </>
          ) : (
            `Standard RFQ — closes at ${when(rfq.bid_close_at)}`
          )}
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
                <tr key={b.carrier_name} className={flash === b.carrier_name ? 'flash' : undefined}>
                  <td><strong>{b.rank}</strong></td>
                  <td>{b.carrier_name}</td>
                  <td>{money(b.freight_charges)}</td>
                  <td>{money(b.origin_charges)}</td>
                  <td>{money(b.destination_charges)}</td>
                  <td><strong>{money(b.total)}</strong></td>
                  <td>{b.transit_time_days}</td>
                  <td>{fmtDay(b.quote_valid_until)}</td>
                  <td>{when(b.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rfq.status === 'Active' ? (
        <BidForm rfqId={rfq.id} />
      ) : rfq.status === 'Upcoming' ? (
        <p className="muted">Bidding has not started yet.</p>
      ) : (
        <p className="closed-note">
          Bidding closed — {l1 ? `L1: ${l1.carrier_name} ${money(l1.total)}` : 'no quotes received'}
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
                <span className="muted">{when(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

const EMPTY_QUOTE = {
  carrier_name: '',
  freight_charges: '',
  origin_charges: '',
  destination_charges: '',
  transit_time_days: '',
  quote_valid_until: '',
}

function BidForm({ rfqId }) {
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [form, setForm] = useState(EMPTY_QUOTE)

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const total =
    Number(form.freight_charges || 0) +
    Number(form.origin_charges || 0) +
    Number(form.destination_charges || 0)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      const r = await submitBid(rfqId, {
        ...form,
        freight_charges: Number(form.freight_charges),
        origin_charges: Number(form.origin_charges),
        destination_charges: Number(form.destination_charges),
        transit_time_days: Number(form.transit_time_days),
        quote_valid_until: new Date(form.quote_valid_until).toISOString(),
      })
      setNotice(`Quote placed — you're ${r.rank} at ${money(r.total)}`)
      setForm(EMPTY_QUOTE)
    } catch (err) {
      setNotice(null)
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
          <p className="total-preview">Total: <strong>{money(total)}</strong></p>
        </div>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="button" type="submit">Submit Quote</button>
      </form>
    </section>
  )
}

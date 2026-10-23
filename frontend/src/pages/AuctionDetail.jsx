import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRfq, money, submitBid, subscribeToRfq, when, whenDay } from '../api'

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

function ago(iso) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AuctionDetail() {
  const { id } = useParams()
  const [rfq, setRfq] = useState(null)
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [live, setLive] = useState(true)
  const [flash, setFlash] = useState(null)   // carrier whose row just changed
  const [banner, setBanner] = useState(null) // "extended to …" strip
  const prev = useRef(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    document.title = rfq ? `${rfq.name} · RFQ Auction` : 'RFQ Auction'
  }, [rfq?.name])

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

    let retry
    const load = () =>
      getRfq(id).then(apply).catch((e) => {
        if (e.status) setError(e.message)       // the api answered: a real error like 404
        else retry = setTimeout(load, 5000)     // asleep or unreachable: keep trying
      })
    load()
    const slowTimer = setTimeout(() => setSlow(true), 3000)
    const unsubscribe = subscribeToRfq(id, apply, setLive)
    return () => {
      clearTimeout(retry)
      clearTimeout(slowTimer)
      unsubscribe()
    }
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!rfq) {
    return (
      <p className="muted">
        {slow ? 'Waking up the server — free hosting, this can take up to a minute.' : 'Loading…'}
      </p>
    )
  }

  const secsLeft = Math.max(0, Math.floor((new Date(rfq.current_close_at) - Date.now()) / 1000))
  const over = rfq.status === 'Closed' || rfq.status === 'Force Closed'
  const l1 = rfq.bids[0]

  return (
    <>
      <Link to="/" className="back">← Back to auctions</Link>

      <div className="card detail-header">
        <div>
          <h2>{rfq.name}</h2>
          <p className="muted">
            <span className="mono">{rfq.reference_id}</span> · Pickup / service {whenDay(rfq.service_date)}
          </p>
        </div>
        <div className="header-right">
          <span className={`badge ${rfq.status.toLowerCase().replace(' ', '-')}`}>
            {rfq.status}
          </span>
          <span className={live ? 'live' : 'live down'}>
            ● {live ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
      </div>

      {rfq.status === 'Active' && (
        <div className="stickybar">
          <span className="stickybar-label">Closes in</span>
          <span className={'countdown' + (secsLeft < 120 ? ' danger' : '')}>
            {countdown(secsLeft)}
          </span>
        </div>
      )}

      {banner && <div className="banner">{banner}</div>}

      <div className="meta-grid">
        <div className="meta">
          <span className="meta-label">{over ? 'Closed' : 'Closes in'}</span>
          {rfq.status === 'Active' ? (
            <span className={'countdown' + (secsLeft < 120 ? ' danger' : '')}>
              {countdown(secsLeft)}
            </span>
          ) : rfq.status === 'Upcoming' ? (
            `starts ${when(rfq.bid_start_at)}`
          ) : (
            'Ended'
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
          <table className="stack">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Carrier</th>
                <th className="num">Freight</th>
                <th className="num">Origin</th>
                <th className="num">Destination</th>
                <th className="num">Total</th>
                <th className="num">Transit (days)</th>
                <th>Valid Until</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rfq.bids.map((b) => (
                <tr
                  key={b.carrier_name}
                  className={
                    (b.rank === 'L1' ? 'l1-row' : '') +
                    (flash === b.carrier_name ? ' flash' : '')
                  }
                >
                  <td className="row-pin">
                    <span className={b.rank === 'L1' ? 'rank l1' : 'rank'}>{b.rank}</span>
                  </td>
                  <td className="row-title"><strong>{b.carrier_name}</strong></td>
                  <td data-label="Freight" className="num">{money(b.freight_charges)}</td>
                  <td data-label="Origin" className="num">{money(b.origin_charges)}</td>
                  <td data-label="Destination" className="num">{money(b.destination_charges)}</td>
                  <td data-label="Total" className="num"><strong>{money(b.total)}</strong></td>
                  <td data-label="Transit (days)" className="num">{b.transit_time_days}</td>
                  <td data-label="Valid until">{whenDay(b.quote_valid_until)}</td>
                  <td data-label="Submitted">{when(b.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rfq.status === 'Active' ? (
        <BidForm rfqId={rfq.id} bids={rfq.bids} />
      ) : rfq.status === 'Upcoming' ? (
        <p className="muted">Bidding has not started yet.</p>
      ) : (
        <section className="card closed-panel">
          Bidding closed — {l1 ? `L1: ${l1.carrier_name} ${money(l1.total)}` : 'no quotes received'}
        </section>
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
                <span className="muted mono" title={when(e.at)}>{ago(e.at)}</span>
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

function BidForm({ rfqId, bids }) {
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [form, setForm] = useState(EMPTY_QUOTE)

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const total =
    Number(form.freight_charges || 0) +
    Number(form.origin_charges || 0) +
    Number(form.destination_charges || 0)

  // the carrier's current quote, if they have bid on this rfq before
  const existing = bids.find((b) => b.carrier_name === form.carrier_name.trim())

  async function onSubmit(e) {
    e.preventDefault()
    if (existing && total >= existing.total) {
      setNotice(null)
      setError(`new total must be lower than your previous quote (${money(existing.total)})`)
      return
    }
    setError(null)
    try {
      const r = await submitBid(rfqId, {
        ...form,
        carrier_name: form.carrier_name.trim(),
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
        {existing && (
          <p className="muted">
            Your last quote was {money(existing.total)} — the new total must be lower.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="button" type="submit">Submit Quote</button>
      </form>
    </section>
  )
}

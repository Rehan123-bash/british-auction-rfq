import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRfq } from '../api'

const pad = (n) => String(n).padStart(2, '0')

// datetime-local inputs want local wall time as "YYYY-MM-DDTHH:mm"
const localInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// prefilled so a reviewer can run a full 15-minute auction in two clicks
function defaults() {
  const now = new Date()
  const plusMin = (m) => new Date(now.getTime() + m * 60000)
  return {
    name: "Mundra → Hamburg, 10 × 40' HC",
    bid_start_at: localInput(now),
    bid_close_at: localInput(plusMin(15)),
    forced_close_at: localInput(plusMin(30)),
    service_date: plusMin(10 * 24 * 60).toISOString().slice(0, 10),
    british_auction: true,
    trigger_window_minutes: 5,
    extension_minutes: 3,
    extension_trigger: 'any_bid',
  }
}

export default function CreateRfq() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [form, setForm] = useState(defaults)

  const set = (e) =>
    setForm({
      ...form,
      [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    })

  async function onSubmit(e) {
    e.preventDefault()
    if (new Date(form.bid_close_at) <= new Date(form.bid_start_at)) {
      setError('bid close must be after bid start')
      return
    }
    if (form.british_auction && new Date(form.forced_close_at) <= new Date(form.bid_close_at)) {
      setError('forced close must be after bid close')
      return
    }
    setError(null)
    // datetime-local inputs are local wall time; the api wants utc instants
    const payload = {
      name: form.name,
      bid_start_at: new Date(form.bid_start_at).toISOString(),
      bid_close_at: new Date(form.bid_close_at).toISOString(),
      service_date: form.service_date,
      british_auction: form.british_auction,
    }
    if (form.british_auction) {
      payload.forced_close_at = new Date(form.forced_close_at).toISOString()
      payload.trigger_window_minutes = Number(form.trigger_window_minutes)
      payload.extension_minutes = Number(form.extension_minutes)
      payload.extension_trigger = form.extension_trigger
    }
    try {
      const { id } = await createRfq(payload)
      navigate(`/rfqs/${id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <Link to="/" className="back">← Back to auctions</Link>

      <form className="card form" onSubmit={onSubmit}>
        <h2>New RFQ</h2>

        <label>
          RFQ Name
          <input name="name" value={form.name} onChange={set} required />
        </label>

        <div className="row">
          <label>
            Bid Start
            <input type="datetime-local" name="bid_start_at" value={form.bid_start_at} onChange={set} required />
          </label>
          <label>
            Bid Close
            <input type="datetime-local" name="bid_close_at" value={form.bid_close_at} onChange={set} required />
          </label>
        </div>

        <label>
          Pickup / Service Date
          <input type="date" name="service_date" value={form.service_date} onChange={set} required />
        </label>

        <label className="radio toggle">
          <input
            type="checkbox"
            name="british_auction"
            checked={form.british_auction}
            onChange={set}
          />
          British auction (auto-extend)
        </label>

        {form.british_auction && (
          <>
            <label>
              Forced Close
              <input type="datetime-local" name="forced_close_at" value={form.forced_close_at} onChange={set} required />
            </label>

            <div className="row">
              <label>
                Trigger Window — X (minutes)
                <input type="number" name="trigger_window_minutes" min="1" value={form.trigger_window_minutes} onChange={set} required />
              </label>
              <label>
                Extension — Y (minutes)
                <input type="number" name="extension_minutes" min="1" value={form.extension_minutes} onChange={set} required />
              </label>
            </div>

            <fieldset>
              <legend>Extend the auction on</legend>
              {[
                ['any_bid', 'Any new bid'],
                ['any_rank_change', 'Any rank change'],
                ['l1_change', 'L1 change'],
              ].map(([value, label]) => (
                <label key={value} className="radio">
                  <input
                    type="radio"
                    name="extension_trigger"
                    value={value}
                    checked={form.extension_trigger === value}
                    onChange={set}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </>
        )}

        {error && <p className="error">{error}</p>}
        <button className="button" type="submit">Create RFQ</button>
      </form>
    </>
  )
}

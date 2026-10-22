import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRfq } from '../api'

export default function CreateRfq() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    name: '',
    reference_id: '',
    bid_start_at: '',
    bid_close_at: '',
    forced_close_at: '',
    service_date: '',
    trigger_window_minutes: 5,
    extension_minutes: 3,
    extension_trigger: 'any_bid',
  })

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      const { id } = await createRfq({
        ...form,
        // datetime-local inputs are local wall time; the api wants utc instants
        bid_start_at: new Date(form.bid_start_at).toISOString(),
        bid_close_at: new Date(form.bid_close_at).toISOString(),
        forced_close_at: new Date(form.forced_close_at).toISOString(),
        trigger_window_minutes: Number(form.trigger_window_minutes),
        extension_minutes: Number(form.extension_minutes),
      })
      navigate(`/rfqs/${id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="card form" onSubmit={onSubmit}>
      <h2>New RFQ</h2>

      <label>
        RFQ Name
        <input name="name" value={form.name} onChange={set} required />
      </label>
      <label>
        Reference ID
        <input name="reference_id" value={form.reference_id} onChange={set} required />
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

      <div className="row">
        <label>
          Forced Close
          <input type="datetime-local" name="forced_close_at" value={form.forced_close_at} onChange={set} required />
        </label>
        <label>
          Pickup / Service Date
          <input type="date" name="service_date" value={form.service_date} onChange={set} required />
        </label>
      </div>

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

      {error && <p className="error">{error}</p>}
      <button className="button" type="submit">Create RFQ</button>
    </form>
  )
}

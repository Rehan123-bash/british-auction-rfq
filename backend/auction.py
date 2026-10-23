from datetime import timedelta

import models


def short_time(dt):
    # clock format used in audit messages, matching the UI: "9:54 PM"
    return dt.strftime("%I:%M %p").lstrip("0")


def status(rfq, now):
    if now < rfq.bid_start_at:
        return "Upcoming"
    if now < rfq.current_close_at:
        return "Active"
    # standard rfqs just close; a british one that got pinned at the ceiling is force closed
    if not rfq.british_auction or rfq.current_close_at < rfq.forced_close_at:
        return "Closed"
    return "Force Closed"


def ranking(db, rfq_id):
    # a carrier's current bid is its most recent one; L1 = lowest total
    latest = {}
    for bid in db.query(models.Bid).filter(models.Bid.rfq_id == rfq_id).order_by(models.Bid.id):
        latest[bid.carrier_name] = bid
    return sorted(latest.values(), key=lambda b: b.total)


def maybe_extend(rfq, ranking_before, ranking_after, now):
    """Called right after a bid lands. ranking_before/after are carrier names in rank order.
    Mutates rfq.current_close_at and returns {old_close, new_close, reason}, or None."""
    if not rfq.british_auction:
        return None

    window_start = rfq.current_close_at - timedelta(minutes=rfq.trigger_window_minutes)
    if not (window_start <= now < rfq.current_close_at):
        return None

    if rfq.extension_trigger == "any_bid":
        fired = True
        reason = "bid received inside trigger window"
    elif rfq.extension_trigger == "any_rank_change":
        fired = ranking_before != ranking_after
        reason = "ranking changed"
    else:  # l1_change
        before_l1 = ranking_before[0] if ranking_before else None
        after_l1 = ranking_after[0] if ranking_after else None
        fired = before_l1 != after_l1
        if before_l1 is None:
            reason = f"{after_l1} set the first L1"
        else:
            reason = f"L1 changed from {before_l1} to {after_l1}"
    if not fired:
        return None

    new_close = min(rfq.current_close_at + timedelta(minutes=rfq.extension_minutes),
                    rfq.forced_close_at)
    if new_close <= rfq.current_close_at:
        return None  # already sitting at forced close, nothing left to give

    old_close = rfq.current_close_at
    rfq.current_close_at = new_close
    return {"old_close": old_close, "new_close": new_close, "reason": reason}

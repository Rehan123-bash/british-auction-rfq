from datetime import datetime, timedelta

from auction import maybe_extend
from models import Rfq

CLOSE = datetime(2026, 1, 1, 12, 0)


def make_rfq(trigger="any_bid", x=5, y=3, forced_gap_min=60):
    return Rfq(
        bid_start_at=CLOSE - timedelta(hours=1),
        bid_close_at=CLOSE,
        current_close_at=CLOSE,
        forced_close_at=CLOSE + timedelta(minutes=forced_gap_min),
        trigger_window_minutes=x,
        extension_minutes=y,
        extension_trigger=trigger,
    )


def test_bid_outside_window_does_not_extend():
    rfq = make_rfq()
    result = maybe_extend(rfq, [], ["acme"], now=CLOSE - timedelta(minutes=10))
    assert result is None
    assert rfq.current_close_at == CLOSE


def test_any_bid_inside_window_extends():
    rfq = make_rfq()
    result = maybe_extend(rfq, [], ["acme"], now=CLOSE - timedelta(minutes=2))
    assert result["new_close"] == CLOSE + timedelta(minutes=3)
    assert rfq.current_close_at == CLOSE + timedelta(minutes=3)


def test_l1_change_needs_a_new_leader():
    now = CLOSE - timedelta(minutes=2)

    rfq = make_rfq(trigger="l1_change")
    assert maybe_extend(rfq, ["acme", "blue"], ["acme", "cargo", "blue"], now) is None

    rfq = make_rfq(trigger="l1_change")
    result = maybe_extend(rfq, ["acme", "blue"], ["cargo", "acme", "blue"], now)
    assert result["reason"] == "L1 changed from acme to cargo"


def test_extension_never_passes_forced_close():
    rfq = make_rfq(y=3, forced_gap_min=2)
    result = maybe_extend(rfq, [], ["acme"], now=CLOSE - timedelta(minutes=1))
    assert result["new_close"] == rfq.forced_close_at

    # pinned at forced close now, a later bid cannot extend again
    result = maybe_extend(rfq, ["acme"], ["blue"], now=rfq.forced_close_at - timedelta(minutes=1))
    assert result is None

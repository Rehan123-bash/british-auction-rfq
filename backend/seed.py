from datetime import timedelta

import models
from auction import short_time
from database import Base, SessionLocal, engine, utcnow


def _add_rfq(db, **kw):
    rfq = models.Rfq(**kw)
    db.add(rfq)
    db.flush()
    return rfq


def _add_bid(db, rfq, carrier, freight, origin, dest, transit, at):
    total = freight + origin + dest
    db.add(models.Bid(
        rfq_id=rfq.id, carrier_name=carrier, freight_charges=freight,
        origin_charges=origin, destination_charges=dest, total=total,
        transit_time_days=transit, quote_valid_until=utcnow() + timedelta(days=21),
        created_at=at,
    ))
    db.add(models.ActivityLog(rfq_id=rfq.id, type="bid", created_at=at,
                              message=f"{carrier} quoted {total:.2f}"))


def _add_extension(db, rfq, new_close, reason, at):
    db.add(models.ActivityLog(rfq_id=rfq.id, type="extension", created_at=at,
                              message=f"closing time extended to {short_time(new_close)} — {reason}"))


def run(db):
    """Startup seeding: the full demo set on an empty db, plus always one live auction."""
    if db.query(models.Rfq).first() is None:
        _seed_demo_lanes(db)
    _ensure_live_auction(db)


def _ensure_live_auction(db):
    # the demo always needs something to bid on; recreate a live lane when none is active
    now = utcnow()
    live = (db.query(models.Rfq)
              .filter(models.Rfq.british_auction.is_(True),
                      models.Rfq.bid_start_at <= now,
                      models.Rfq.current_close_at > now)
              .first())
    if live is not None:
        return

    rfq = _add_rfq(
        db,
        name="Pipavav → Antwerp, 12 × 40' GP",
        bid_start_at=now - timedelta(minutes=10),
        bid_close_at=now + timedelta(minutes=20),
        current_close_at=now + timedelta(minutes=20),
        forced_close_at=now + timedelta(minutes=35),
        service_date=now + timedelta(days=8),
        trigger_window_minutes=5, extension_minutes=3, extension_trigger="any_bid",
    )
    _add_bid(db, rfq, "Hapag-Lloyd", 1000, 150, 90, 21, now - timedelta(minutes=8))  # 1240
    _add_bid(db, rfq, "Maersk", 970, 140, 85, 19, now - timedelta(minutes=6))        # 1195
    _add_bid(db, rfq, "Hapag-Lloyd", 930, 135, 80, 21, now - timedelta(minutes=4))   # 1145
    _add_bid(db, rfq, "Maersk", 920, 130, 75, 19, now - timedelta(minutes=2))        # 1125 -> L1
    db.commit()


def _seed_demo_lanes(db):
    now = utcnow()

    # active lane with a live bid war: maersk opens, gets undercut twice, rebids to take L1 back
    active = _add_rfq(
        db,
        name="Nhava Sheva → Rotterdam, 20 × 40' HC",
        bid_start_at=now - timedelta(minutes=30),
        bid_close_at=now + timedelta(minutes=25),
        current_close_at=now + timedelta(minutes=25),
        forced_close_at=now + timedelta(minutes=40),
        service_date=now + timedelta(days=10),
        trigger_window_minutes=5, extension_minutes=3, extension_trigger="any_bid",
    )
    _add_bid(db, active, "Maersk", 980, 130, 90, 24, now - timedelta(minutes=25))    # 1200
    _add_bid(db, active, "MSC", 960, 125, 95, 26, now - timedelta(minutes=18))       # 1180
    _add_bid(db, active, "CMA CGM", 930, 128, 92, 23, now - timedelta(minutes=12))   # 1150
    _add_bid(db, active, "Maersk", 850, 115, 85, 24, now - timedelta(minutes=6))     # 1050 -> L1

    _add_rfq(
        db,
        name="Chennai → Jebel Ali LCL, 12 CBM",
        bid_start_at=now + timedelta(hours=2),
        bid_close_at=now + timedelta(hours=6),
        current_close_at=now + timedelta(hours=6),
        forced_close_at=now + timedelta(hours=7),
        service_date=now + timedelta(days=14),
        trigger_window_minutes=10, extension_minutes=5, extension_trigger="any_rank_change",
    )

    # a standard rfq: no extension config, forced close == bid close
    closed = _add_rfq(
        db,
        name="Mundra → Felixstowe reefer, 6 × 40' RF",
        bid_start_at=now - timedelta(days=2),
        bid_close_at=now - timedelta(days=1),
        current_close_at=now - timedelta(days=1),
        forced_close_at=now - timedelta(days=1),
        service_date=now + timedelta(days=4),
        british_auction=False,
    )
    _add_bid(db, closed, "MSC", 1700, 200, 150, 28, now - timedelta(days=1, hours=5))     # 2050
    _add_bid(db, closed, "Maersk", 1620, 180, 120, 25, now - timedelta(days=1, hours=2))  # 1920 -> L1

    # late bids extended this one twice, pinning the close at the forced ceiling
    t0 = now - timedelta(hours=3)
    pinned = _add_rfq(
        db,
        name="Kolkata → Singapore, 8 × 20' GP",
        bid_start_at=t0 - timedelta(hours=4),
        bid_close_at=t0,
        current_close_at=t0 + timedelta(minutes=6),
        forced_close_at=t0 + timedelta(minutes=6),
        service_date=now + timedelta(days=6),
        trigger_window_minutes=5, extension_minutes=3, extension_trigger="any_bid",
    )
    _add_bid(db, pinned, "CMA CGM", 540, 90, 60, 18, t0 - timedelta(hours=2))        # 690
    _add_bid(db, pinned, "MSC", 520, 85, 55, 20, t0 - timedelta(minutes=4))          # 660
    _add_extension(db, pinned, t0 + timedelta(minutes=3),
                   "bid received inside trigger window", t0 - timedelta(minutes=4))
    _add_bid(db, pinned, "CMA CGM", 500, 80, 50, 18, t0 + timedelta(minutes=1))      # 630 -> L1
    _add_extension(db, pinned, t0 + timedelta(minutes=6),
                   "bid received inside trigger window", t0 + timedelta(minutes=1))

    db.commit()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        run(db)
        print("seed check done")

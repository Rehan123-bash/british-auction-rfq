from datetime import timedelta

import models
from database import Base, SessionLocal, engine, utcnow


def run(db):
    """Create the demo lanes if the database is empty. Returns True if it seeded."""
    if db.query(models.Rfq).first() is not None:
        return False

    now = utcnow()
    iso = lambda dt: dt.isoformat() + "Z"

    def add_rfq(**kw):
        rfq = models.Rfq(**kw)
        db.add(rfq)
        db.flush()
        return rfq

    def add_bid(rfq, carrier, freight, origin, dest, transit, at):
        total = freight + origin + dest
        db.add(models.Bid(
            rfq_id=rfq.id, carrier_name=carrier, freight_charges=freight,
            origin_charges=origin, destination_charges=dest, total=total,
            transit_time_days=transit, quote_valid_until=now + timedelta(days=21),
            created_at=at,
        ))
        db.add(models.ActivityLog(rfq_id=rfq.id, type="bid", created_at=at,
                                  message=f"{carrier} quoted {total:.2f}"))

    def add_extension(rfq, new_close, reason, at):
        db.add(models.ActivityLog(rfq_id=rfq.id, type="extension", created_at=at,
                                  message=f"closing time extended to {iso(new_close)} — {reason}"))

    # active lane with a live bid war: maersk opens, gets undercut twice, rebids to take L1 back
    active = add_rfq(
        name="Nhava Sheva → Rotterdam, 20 × 40' HC",
        bid_start_at=now - timedelta(minutes=30),
        bid_close_at=now + timedelta(minutes=25),
        current_close_at=now + timedelta(minutes=25),
        forced_close_at=now + timedelta(minutes=40),
        service_date=now + timedelta(days=10),
        trigger_window_minutes=5, extension_minutes=3, extension_trigger="any_bid",
    )
    add_bid(active, "Maersk", 980, 130, 90, 24, now - timedelta(minutes=25))    # 1200
    add_bid(active, "MSC", 960, 125, 95, 26, now - timedelta(minutes=18))       # 1180
    add_bid(active, "CMA CGM", 930, 128, 92, 23, now - timedelta(minutes=12))   # 1150
    add_bid(active, "Maersk", 850, 115, 85, 24, now - timedelta(minutes=6))     # 1050 -> L1

    add_rfq(
        name="Chennai → Jebel Ali LCL, 12 CBM",
        bid_start_at=now + timedelta(hours=2),
        bid_close_at=now + timedelta(hours=6),
        current_close_at=now + timedelta(hours=6),
        forced_close_at=now + timedelta(hours=7),
        service_date=now + timedelta(days=14),
        trigger_window_minutes=10, extension_minutes=5, extension_trigger="any_rank_change",
    )

    # a standard rfq: no extension config, forced close == bid close
    closed = add_rfq(
        name="Mundra → Felixstowe reefer, 6 × 40' RF",
        bid_start_at=now - timedelta(days=2),
        bid_close_at=now - timedelta(days=1),
        current_close_at=now - timedelta(days=1),
        forced_close_at=now - timedelta(days=1),
        service_date=now + timedelta(days=4),
        british_auction=False,
    )
    add_bid(closed, "MSC", 1700, 200, 150, 28, now - timedelta(days=1, hours=5))     # 2050
    add_bid(closed, "Maersk", 1620, 180, 120, 25, now - timedelta(days=1, hours=2))  # 1920 -> L1

    # late bids extended this one twice, pinning the close at the forced ceiling
    t0 = now - timedelta(hours=3)
    pinned = add_rfq(
        name="Kolkata → Singapore, 8 × 20' GP",
        bid_start_at=t0 - timedelta(hours=4),
        bid_close_at=t0,
        current_close_at=t0 + timedelta(minutes=6),
        forced_close_at=t0 + timedelta(minutes=6),
        service_date=now + timedelta(days=6),
        trigger_window_minutes=5, extension_minutes=3, extension_trigger="any_bid",
    )
    add_bid(pinned, "CMA CGM", 540, 90, 60, 18, t0 - timedelta(hours=2))        # 690
    add_bid(pinned, "MSC", 520, 85, 55, 20, t0 - timedelta(minutes=4))          # 660
    add_extension(pinned, t0 + timedelta(minutes=3),
                  "bid received inside trigger window", t0 - timedelta(minutes=4))
    add_bid(pinned, "CMA CGM", 500, 80, 50, 18, t0 + timedelta(minutes=1))      # 630 -> L1
    add_extension(pinned, t0 + timedelta(minutes=6),
                  "bid received inside trigger window", t0 + timedelta(minutes=1))

    db.commit()
    return True


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        print("seeded 4 rfqs" if run(db) else "rfqs already exist, skipping seed")

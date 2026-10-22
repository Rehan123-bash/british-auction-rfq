from datetime import timedelta

import models
from database import Base, SessionLocal, engine, utcnow

Base.metadata.create_all(bind=engine)

db = SessionLocal()
now = utcnow()
rfq = models.Rfq(
    name="Demo: Mumbai to Felixstowe FCL",
    reference_id="RFQ-DEMO-001",
    bid_start_at=now,
    bid_close_at=now + timedelta(minutes=15),
    current_close_at=now + timedelta(minutes=15),
    forced_close_at=now + timedelta(minutes=25),
    service_date=now + timedelta(days=7),
    trigger_window_minutes=5,
    extension_minutes=3,
    extension_trigger="any_bid",
)
db.add(rfq)
db.commit()
print(f"seeded rfq {rfq.id}: closes {rfq.bid_close_at}Z, forced close {rfq.forced_close_at}Z")
db.close()

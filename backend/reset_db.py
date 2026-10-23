"""One-off maintenance: wipe all auction data and reseed the demo lanes.

Deliberately refuses to fall back to the local sqlite file — the target
database must be named explicitly via DATABASE_URL.
"""
import os
import sys

if not os.environ.get("DATABASE_URL"):
    sys.exit("DATABASE_URL is not set — refusing to run against an implicit database")

import models
import seed
from database import Base, SessionLocal, engine

Base.metadata.create_all(bind=engine)

with SessionLocal() as db:
    # children first so foreign keys stay happy
    logs = db.query(models.ActivityLog).delete()
    bids = db.query(models.Bid).delete()
    rfqs = db.query(models.Rfq).delete()
    db.commit()
    print(f"deleted {rfqs} rfqs, {bids} bids, {logs} log rows")

    seed.run(db)
    print("demo lanes reseeded")

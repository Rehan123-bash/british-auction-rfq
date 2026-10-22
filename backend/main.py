import asyncio
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

import auction
import models
from database import Base, SessionLocal, engine, get_db, utcnow
from schemas import BidCreate, RfqCreate

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="RFQ Auction")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def iso(dt):
    return dt.isoformat() + "Z"


def rfq_detail(db, rfq):
    now = utcnow()
    ranked = auction.ranking(db, rfq.id)
    log = (db.query(models.ActivityLog)
             .filter(models.ActivityLog.rfq_id == rfq.id)
             .order_by(models.ActivityLog.id.desc())
             .all())
    return {
        "id": rfq.id,
        "name": rfq.name,
        "reference_id": rfq.reference_id,
        "status": auction.status(rfq, now),
        "bid_start_at": iso(rfq.bid_start_at),
        "bid_close_at": iso(rfq.bid_close_at),
        "current_close_at": iso(rfq.current_close_at),
        "forced_close_at": iso(rfq.forced_close_at),
        "service_date": iso(rfq.service_date),
        "trigger_window_minutes": rfq.trigger_window_minutes,
        "extension_minutes": rfq.extension_minutes,
        "extension_trigger": rfq.extension_trigger,
        "bids": [{
            "rank": f"L{i + 1}",
            "carrier_name": b.carrier_name,
            "freight_charges": b.freight_charges,
            "origin_charges": b.origin_charges,
            "destination_charges": b.destination_charges,
            "total": b.total,
            "transit_time_days": b.transit_time_days,
            "quote_valid_until": iso(b.quote_valid_until),
            "submitted_at": iso(b.created_at),
        } for i, b in enumerate(ranked)],
        "activity": [{
            "type": e.type,
            "message": e.message,
            "at": iso(e.created_at),
        } for e in log],
    }


@app.post("/rfqs", status_code=201)
def create_rfq(body: RfqCreate, db: Session = Depends(get_db)):
    if body.bid_close_at <= body.bid_start_at:
        raise HTTPException(400, "bid_close_at must be after bid_start_at")
    if body.forced_close_at <= body.bid_close_at:
        raise HTTPException(400, "forced_close_at must be after bid_close_at")
    rfq = models.Rfq(**body.model_dump(), current_close_at=body.bid_close_at)
    db.add(rfq)
    db.commit()
    db.refresh(rfq)
    return {"id": rfq.id}


@app.get("/rfqs")
def list_rfqs(db: Session = Depends(get_db)):
    now = utcnow()
    out = []
    for rfq in db.query(models.Rfq).order_by(models.Rfq.id.desc()).all():
        # carriers only ever lower their price, so the overall min is the current L1 total
        lowest = db.query(func.min(models.Bid.total)).filter(models.Bid.rfq_id == rfq.id).scalar()
        out.append({
            "id": rfq.id,
            "name": rfq.name,
            "status": auction.status(rfq, now),
            "lowest_bid": lowest,
            "current_close_at": iso(rfq.current_close_at),
            "forced_close_at": iso(rfq.forced_close_at),
        })
    return out


@app.get("/rfqs/{rfq_id}")
def get_rfq(rfq_id: int, db: Session = Depends(get_db)):
    rfq = db.get(models.Rfq, rfq_id)
    if rfq is None:
        raise HTTPException(404, "rfq not found")
    return rfq_detail(db, rfq)


@app.post("/rfqs/{rfq_id}/bids", status_code=201)
def submit_bid(rfq_id: int, body: BidCreate, db: Session = Depends(get_db)):
    rfq = db.get(models.Rfq, rfq_id)
    if rfq is None:
        raise HTTPException(404, "rfq not found")

    now = utcnow()
    if auction.status(rfq, now) != "Active":
        raise HTTPException(400, "auction is not active")

    total = body.freight_charges + body.origin_charges + body.destination_charges

    last = (db.query(models.Bid)
              .filter(models.Bid.rfq_id == rfq.id, models.Bid.carrier_name == body.carrier_name)
              .order_by(models.Bid.id.desc())
              .first())
    if last is not None and total >= last.total:
        raise HTTPException(400, f"new total must be lower than your previous bid ({last.total})")

    ranking_before = [b.carrier_name for b in auction.ranking(db, rfq.id)]

    bid = models.Bid(rfq_id=rfq.id, total=total, created_at=now, **body.model_dump())
    db.add(bid)
    db.flush()  # make the new bid visible to ranking() before commit

    ranking_after = [b.carrier_name for b in auction.ranking(db, rfq.id)]

    db.add(models.ActivityLog(rfq_id=rfq.id, type="bid", created_at=now,
                              message=f"{body.carrier_name} quoted {total:.2f}"))

    ext = auction.maybe_extend(rfq, ranking_before, ranking_after, now)
    if ext:
        db.add(models.ActivityLog(rfq_id=rfq.id, type="extension", created_at=now,
                                  message=f"closing time extended to {iso(ext['new_close'])} — {ext['reason']}"))

    db.commit()
    return {"id": bid.id, "total": total,
            "extended_to": iso(rfq.current_close_at) if ext else None}


@app.get("/rfqs/{rfq_id}/stream")
async def stream_rfq(rfq_id: int):
    # each tick opens a short-lived session so the stream always reads fresh state
    async def events():
        while True:
            db = SessionLocal()
            try:
                rfq = db.get(models.Rfq, rfq_id)
                if rfq is None:
                    break
                payload = rfq_detail(db, rfq)
            finally:
                db.close()
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache"})

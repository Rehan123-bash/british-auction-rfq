import os
from datetime import datetime

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import Base, engine, get_db
from schemas import RfqCreate

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


def rfq_status(rfq, now):
    if now < rfq.bid_start_at:
        return "Upcoming"
    if now < rfq.current_close_at:
        return "Active"
    if rfq.current_close_at < rfq.forced_close_at:
        return "Closed"
    return "Force Closed"


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
    now = datetime.utcnow()
    out = []
    for rfq in db.query(models.Rfq).order_by(models.Rfq.id.desc()).all():
        # carriers only ever lower their price, so the overall min is the current L1 total
        lowest = db.query(func.min(models.Bid.total)).filter(models.Bid.rfq_id == rfq.id).scalar()
        out.append({
            "id": rfq.id,
            "name": rfq.name,
            "status": rfq_status(rfq, now),
            "lowest_bid": lowest,
            "current_close_at": iso(rfq.current_close_at),
            "forced_close_at": iso(rfq.forced_close_at),
        })
    return out

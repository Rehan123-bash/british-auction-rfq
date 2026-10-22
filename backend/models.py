from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from database import Base, utcnow


class Rfq(Base):
    __tablename__ = "rfqs"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    reference_id = Column(String, nullable=False)
    bid_start_at = Column(DateTime, nullable=False)
    bid_close_at = Column(DateTime, nullable=False)
    forced_close_at = Column(DateTime, nullable=False)
    service_date = Column(DateTime, nullable=False)

    # extension config: X minutes before close, extend by Y minutes, on trigger
    trigger_window_minutes = Column(Integer, nullable=False)
    extension_minutes = Column(Integer, nullable=False)
    extension_trigger = Column(String, nullable=False)  # any_bid | any_rank_change | l1_change

    # starts equal to bid_close_at, moves forward on extensions, capped at forced_close_at
    current_close_at = Column(DateTime, nullable=False)


class Bid(Base):
    __tablename__ = "bids"

    id = Column(Integer, primary_key=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id"), nullable=False)
    carrier_name = Column(String, nullable=False)
    freight_charges = Column(Float, nullable=False)
    origin_charges = Column(Float, nullable=False)
    destination_charges = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    transit_time_days = Column(Integer, nullable=False)
    quote_valid_until = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id"), nullable=False)
    type = Column(String, nullable=False)  # bid | extension
    message = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

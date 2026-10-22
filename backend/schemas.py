from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_validator


# store naive utc everywhere so sqlite and postgres behave the same
def utc_naive(v: datetime) -> datetime:
    if v.tzinfo is not None:
        v = v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


class RfqCreate(BaseModel):
    name: str
    reference_id: str
    bid_start_at: datetime
    bid_close_at: datetime
    forced_close_at: datetime
    service_date: datetime
    trigger_window_minutes: int
    extension_minutes: int
    extension_trigger: Literal["any_bid", "any_rank_change", "l1_change"]

    _utc = field_validator("bid_start_at", "bid_close_at", "forced_close_at", "service_date")(utc_naive)


class BidCreate(BaseModel):
    carrier_name: str
    freight_charges: float
    origin_charges: float
    destination_charges: float
    transit_time_days: int
    quote_valid_until: datetime

    _utc = field_validator("quote_valid_until")(utc_naive)

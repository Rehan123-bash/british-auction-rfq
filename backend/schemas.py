from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_validator


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

    # store naive utc everywhere so sqlite and postgres behave the same
    @field_validator("bid_start_at", "bid_close_at", "forced_close_at", "service_date")
    @classmethod
    def to_utc_naive(cls, v):
        if v.tzinfo is not None:
            v = v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator


# store naive utc everywhere so sqlite and postgres behave the same
def utc_naive(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is not None:
        v = v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


class RfqCreate(BaseModel):
    name: str
    bid_start_at: datetime
    bid_close_at: datetime
    forced_close_at: datetime | None = None
    service_date: datetime
    british_auction: bool = True
    trigger_window_minutes: int | None = None
    extension_minutes: int | None = None
    extension_trigger: Literal["any_bid", "any_rank_change", "l1_change"] | None = None

    _utc = field_validator("bid_start_at", "bid_close_at", "forced_close_at", "service_date")(utc_naive)

    # forced close and the X / Y / trigger config only exist for british auctions
    @model_validator(mode="after")
    def require_config_when_british(self):
        if self.british_auction and None in (self.forced_close_at, self.trigger_window_minutes,
                                             self.extension_minutes, self.extension_trigger):
            raise ValueError("a british auction needs forced_close_at, trigger_window_minutes, "
                             "extension_minutes and extension_trigger")
        return self


class BidCreate(BaseModel):
    carrier_name: str
    freight_charges: float
    origin_charges: float
    destination_charges: float
    transit_time_days: int
    quote_valid_until: datetime

    _utc = field_validator("quote_valid_until")(utc_naive)

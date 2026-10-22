-- RFQ auction schema (Postgres flavour; SQLAlchemy creates the same tables
-- automatically on startup, this file documents the shape).
-- All timestamps are UTC.

CREATE TABLE rfqs (
    id                     SERIAL PRIMARY KEY,
    name                   VARCHAR NOT NULL,
    bid_start_at           TIMESTAMP NOT NULL,
    bid_close_at           TIMESTAMP NOT NULL,
    forced_close_at        TIMESTAMP NOT NULL,   -- hard ceiling; equals bid_close_at for standard rfqs
    service_date           TIMESTAMP NOT NULL,   -- pickup / service date

    -- false = standard rfq: no extensions, closes exactly at bid_close_at
    british_auction        BOOLEAN NOT NULL DEFAULT TRUE,

    -- extension config: a qualifying bid in the last X minutes extends the close by Y minutes.
    -- all three are null when british_auction is false
    trigger_window_minutes INTEGER,              -- X
    extension_minutes      INTEGER,              -- Y
    extension_trigger      VARCHAR,              -- any_bid | any_rank_change | l1_change

    -- starts equal to bid_close_at, moves forward on extensions, capped at forced_close_at
    current_close_at       TIMESTAMP NOT NULL
);

CREATE TABLE bids (
    id                  SERIAL PRIMARY KEY,
    rfq_id              INTEGER NOT NULL REFERENCES rfqs(id),
    carrier_name        VARCHAR NOT NULL,
    freight_charges     DOUBLE PRECISION NOT NULL,
    origin_charges      DOUBLE PRECISION NOT NULL,
    destination_charges DOUBLE PRECISION NOT NULL,
    total               DOUBLE PRECISION NOT NULL,  -- freight + origin + destination, computed server-side
    transit_time_days   INTEGER NOT NULL,
    quote_valid_until   TIMESTAMP NOT NULL,
    created_at          TIMESTAMP NOT NULL
);

-- audit trail shown on the details page: every bid and every extension with its reason
CREATE TABLE activity_log (
    id         SERIAL PRIMARY KEY,
    rfq_id     INTEGER NOT NULL REFERENCES rfqs(id),
    type       VARCHAR NOT NULL,   -- bid | extension
    message    VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL
);

"""Which reservations are holding stock right now (shared by reservations and the shop page).

A request holds its quantity from the moment it is made. If the shop does not answer within
REQUEST_TTL_MINUTES the request counts as expired and the hold is released: nothing is stored or
cleaned up, the clock just runs out. An accepted request holds until its own hold_until.

Stock itself only drops when the owner hands the items over (a normal bill).
"""

REQUEST_TTL_MINUTES = 10

# SQL for "this reservation `r` currently holds stock". Bind :request_ttl to REQUEST_TTL_MINUTES.
HOLDING_SQL = (
    "((r.status = 'accepted' AND (r.hold_until IS NULL OR r.hold_until > now())) "
    "OR (r.status = 'requested' AND r.created_at > now() - make_interval(mins => :request_ttl)))"
)

# Same idea for requests still waiting for an answer (counts against the per-shop pending cap).
WAITING_SQL = (
    "(r.status = 'requested' AND r.created_at > now() - make_interval(mins => :request_ttl))"
)

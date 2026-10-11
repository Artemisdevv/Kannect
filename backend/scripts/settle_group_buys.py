"""Settle group buys past their deadline (confirm into orders, or fail). Safe to run often.

Usage (from backend/):  python scripts/settle_group_buys.py

The API also settles lazily whenever group buys are listed or joined, so this is only needed if
you want settlement to happen on a schedule even when nobody opens the app.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal  # noqa: E402
from app.services.group_buys import settle_due  # noqa: E402

if __name__ == "__main__":
    with SessionLocal() as db:
        print(f"settled {settle_due(db)} group buy(ies)")

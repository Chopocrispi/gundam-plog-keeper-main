from dataclasses import dataclass
from typing import Optional

@dataclass
class OfferItem:
    # Product info
    title: str
    url: str
    price: Optional[float]
    currency: Optional[str]
    source: str
    handle: Optional[str] = None

    # Search context (used later to build the offers index for the app)
    query: Optional[str] = None
    grade: Optional[str] = None
    model_code: Optional[str] = None
    scale: Optional[str] = None

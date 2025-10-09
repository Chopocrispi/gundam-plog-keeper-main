from dataclasses import dataclass
from typing import Optional

@dataclass
class OfferItem:
    title: str
    url: str
    price: Optional[float]
    currency: Optional[str]
    source: str
    handle: Optional[str] = None

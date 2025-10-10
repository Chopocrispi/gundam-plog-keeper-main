import json
import re
import scrapy
from urllib.parse import urlencode
from dataclasses import asdict
from gunpla_prices.items import OfferItem
from gunpla_prices.utils import tokenize

class HgusaSpider(scrapy.Spider):
    name = "hgusa"
    custom_settings = {"ROBOTSTXT_OBEY": True, "DOWNLOAD_DELAY": 0.8}

    def add_arguments(self, parser):
        parser.add_argument("-a", dest="query", help="search query", default="")
        parser.add_argument("-a", dest="grade", help="grade (HG/RG/MG/PG/FM/SD)", default="")
        parser.add_argument("-a", dest="model_code", help="model code e.g. MS-06", default="")
        parser.add_argument("-a", dest="scale", help="scale e.g. 1/144", default="")

    def start_requests(self):
        q = (self.query or "").strip()
        if not q:
            raise scrapy.exceptions.CloseSpider("Missing -a query=...")
        base = "https://hobbygundamusa.com/search/suggest.json"
        params = {"q": q, "resources[type]": "product", "resources[limit]": 15}
        url = f"{base}?{urlencode(params)}"
        yield scrapy.Request(url, callback=self.parse_suggest)

    def parse_suggest(self, resp):
        try:
            data = json.loads(resp.text)
        except Exception:
            data = {}
        products = (data.get("resources", {}).get("results", {}).get("products", []) or [])
        toks = tokenize(self.query, getattr(self, "grade", None), getattr(self, "model_code", None), getattr(self, "scale", None))
        for p in products:
            title = p.get("title") or "Product"
            handle = p.get("handle") or (p.get("url", "").split("/products/")[1] if "/products/" in (p.get("url") or "") else None)
            if not handle:
                continue
            score = 0
            nt = title.lower()
            for t in toks:
                if t and t in nt:
                    score += 1
            # fetch product json for price
            prod_js = f"https://hobbygundamusa.com/products/{handle}.js"
            meta = {"score": score, "title": title, "handle": handle}
            yield scrapy.Request(prod_js, callback=self.parse_product, meta=meta)

    def parse_product(self, resp):
        title = resp.meta.get("title")
        handle = resp.meta.get("handle")
        score = resp.meta.get("score", 0)
        price = None
        try:
            pj = json.loads(resp.text)
            cents = pj.get("price")
            if isinstance(cents, (int, float)):
                price = round(float(cents) / 100.0, 2)
        except Exception:
            pass
        item = OfferItem(
            title=title,
            url=f"https://hobbygundamusa.com/products/{handle}",
            price=price,
            currency="USD",
            source="HobbyGundamUSA",
            handle=handle,
            query=getattr(self, "query", None),
            grade=getattr(self, "grade", None),
            model_code=getattr(self, "model_code", None),
            scale=getattr(self, "scale", None),
        )
        yield asdict(item)

import json
import re
import scrapy
from urllib.parse import urlencode
from dataclasses import asdict
from gunpla_prices.items import OfferItem
from gunpla_prices.utils import tokenize, normalize


class HljSpider(scrapy.Spider):
    name = "hlj"
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
        base = "https://www.hlj.com/search/"
        params = {"q": q}
        url = f"{base}?{urlencode(params)}"
        yield scrapy.Request(url, callback=self.parse_search)

    def parse_search(self, resp):
        toks = tokenize(self.query, getattr(self, "grade", None), getattr(self, "model_code", None), getattr(self, "scale", None))
        links = []
        for sel in resp.css('a[href*="/product/"]'):
            href = sel.attrib.get('href')
            text = normalize(' '.join(sel.css('::text').getall()))
            score = sum(1 for t in toks if t and t in text)
            if href:
                if href.startswith('/'):
                    href = f"https://www.hlj.com{href}"
                links.append((score, href))
        links.sort(reverse=True)
        for score, href in links[:5]:
            yield scrapy.Request(href, callback=self.parse_product, meta={"score": score})

    def parse_product(self, resp):
        title = (resp.css('h1::text').get() or resp.css('title::text').get() or 'Product').strip()
        price = None
        # Try JSON-LD first
        for script in resp.css('script[type="application/ld+json"]::text').getall():
            try:
                obj = json.loads(script)
                arr = obj if isinstance(obj, list) else [obj]
                for it in arr:
                    offers = it.get('offers')
                    if isinstance(offers, dict):
                        pr = offers.get('price')
                        if pr:
                            price = float(str(pr).replace(',', '.'))
                            break
            except Exception:
                pass
        if price is None:
            # fallback to common price markers
            txt = ' '.join(resp.css('::text').getall())
            m = re.search(r"([0-9]+(?:\.[0-9]{2})?)\s*(?:JPY|¥)", txt, re.I)
            if m:
                try:
                    price = float(m.group(1))
                except Exception:
                    pass
        item = OfferItem(
            title=title,
            url=resp.url,
            price=price,
            currency="JPY",
            source="HLJ",
            query=getattr(self, "query", None),
            grade=getattr(self, "grade", None),
            model_code=getattr(self, "model_code", None),
            scale=getattr(self, "scale", None),
        )
        yield asdict(item)

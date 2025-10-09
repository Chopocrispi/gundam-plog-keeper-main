import re
import scrapy
from urllib.parse import urlencode
from dataclasses import asdict
from gunpla_prices.items import OfferItem
from gunpla_prices.utils import tokenize, normalize

class GeosanSpider(scrapy.Spider):
    name = "geosan"
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
        base = "https://geosanbattle.com/"
        params = {"s": q, "post_type": "product"}
        url = f"{base}?{urlencode(params)}"
        yield scrapy.Request(url, callback=self.parse_search)

    def parse_search(self, resp):
        toks = tokenize(self.query, getattr(self, "grade", None), getattr(self, "model_code", None), getattr(self, "scale", None))
        links = []
        for sel in resp.css('a[href*="/producto/"]'):
            href = sel.attrib.get('href')
            text = normalize(' '.join(sel.css('::text').getall()))
            score = sum(1 for t in toks if t and t in text)
            links.append((score, href))
        links.sort(reverse=True)
        top = links[:4]
        for score, href in top:
            if not href:
                continue
            yield scrapy.Request(href, callback=self.parse_product, meta={"score": score})

    def parse_product(self, resp):
        title = resp.css('h1::text').get() or resp.css('title::text').get() or 'Product'
        text = ' '.join(resp.css('::text').getall())
        price = None
        # Try JSON-LD first
        for script in resp.css('script[type="application/ld+json"]::text').getall():
            try:
                import json
                obj = json.loads(script)
                arr = obj if isinstance(obj, list) else [obj]
                for it in arr:
                    offers = it.get('offers')
                    if isinstance(offers, list):
                        for off in offers:
                            pr = off.get('price') or off.get('priceSpecification', {}).get('price')
                            if pr:
                                price = float(str(pr).replace(',', '.'))
                                break
                    elif isinstance(offers, dict):
                        pr = offers.get('price') or offers.get('priceSpecification', {}).get('price')
                        if pr:
                            price = float(str(pr).replace(',', '.'))
                    if price is not None:
                        break
            except Exception:
                pass
        if price is None:
            m = re.search(r"(?:(?:€|eur|euros)\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*|[0-9]+)([.,][0-9]{2})\s*(?:€|eur|euros)?", text, re.I)
            if m:
                intp, decp = m.group(1), m.group(2)
                intp = intp.replace('.', '').replace(',', '')
                try:
                    price = float(f"{intp}.{decp[1:]}")
                except Exception:
                    price = None
        item = OfferItem(
            title=title,
            url=resp.url,
            price=price,
            currency="EUR",
            source="Geosan Battle",
        )
        yield asdict(item)

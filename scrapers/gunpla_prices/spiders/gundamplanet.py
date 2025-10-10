from ._shopify_base import ShopifySuggestSpider


class GundamplanetSpider(ShopifySuggestSpider):
    name = "gundamplanet"
    domain = "gundamplanet.com"
    source_name = "Gundam Planet"

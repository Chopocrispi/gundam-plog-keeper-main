from ._shopify_base import ShopifySuggestSpider


class NewtypeSpider(ShopifySuggestSpider):
    name = "newtype"
    domain = "newtype.us"
    source_name = "Newtype"

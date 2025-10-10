from ._shopify_base import ShopifySuggestSpider


class TatsuhobbySpider(ShopifySuggestSpider):
    name = "tatsuhobby"
    domain = "tatsuhobby.com"
    source_name = "Tatsu Hobby"

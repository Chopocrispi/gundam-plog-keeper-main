BOT_NAME = "gunpla_prices"
SPIDER_MODULES = ["gunpla_prices.spiders"]
NEWSPIDER_MODULE = "gunpla_prices.spiders"

ROBOTSTXT_OBEY = True
DOWNLOAD_DELAY = 1.0
CONCURRENT_REQUESTS = 4
DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}
LOG_LEVEL = "INFO"

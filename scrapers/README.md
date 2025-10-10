Scrapy price scrapers (experimental)

This directory contains a standalone Python/Scrapy project to fetch kit prices from stores. It’s separate from the Vite app, so it won’t affect your build.

Quick start (Windows PowerShell)

1) Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2) Install dependencies

```powershell
pip install -r scrapers\requirements.txt
```

3) Run a spider with a query

- HobbyGundamUSA (Shopify):

```powershell
scrapy runspider scrapers\gunpla_prices\spiders\hgusa.py -a query="HG Gundam Aerial"
```

- Geosan Battle (WooCommerce):

```powershell
scrapy runspider scrapers\gunpla_prices\spiders\geosan.py -a query="HG 1/144 Gundam Aerial"
```

4) Save results to JSON

```powershell
scrapy runspider scrapers\gunpla_prices\spiders\hgusa.py -a query="Zaku" -O hgusa-zaku.json
scrapy runspider scrapers\gunpla_prices\spiders\geosan.py -a query="Zaku" -O geosan-zaku.json
```

5) Options

- You can pass optional arguments to refine matching:
  - `-a grade="MG"` (HG/RG/MG/PG/FM/SD)
  - `-a scale="1/144"`
  - `-a model_code="MS-06"`

Project layout

```
scrapers/
  requirements.txt        # Python deps
  scrapy.cfg              # Scrapy config
  gunpla_prices/
    __init__.py
    items.py              # Item schema
    pipelines.py          # Optional normalization
    settings.py           # Scrapy settings
    utils.py              # Helpers for parsing/normalization
    spiders/
      __init__.py
      hgusa.py            # HGUSA spider
      geosan.py           # Geosan spider
```

Notes

- Be gentle with sites; keep concurrency low by default.
- This is for personal/experimental use. Respect each store’s terms of service and robots.txt. You can toggle `ROBOTSTXT_OBEY` in `settings.py`.
- If sites change HTML, update the selectors/regex in the spider.

# Connector test report

Generated automatically by a live run at `2026-11-05T18:26:16.411117+00:00`. Do not edit by hand.

| Chain | Status | Source | Connection | Be'er Sheva branches | Items parsed | Valid prices | Sample real product | Latest file |
|---|---|---|---|---:|---:|---:|---|---|
| שופרסל | **VERIFIED** | https://prices.shufersal.co.il/ | HTML listing with signed blob links | 9 | 7621 | 7621 | שקיות זיפר M 25 יחידות (10900035187): 16.90 ILS at דיל ב"ש- נווה מנחם | PriceFull7290027600007-002-248-20261105-030000.gz |
| רמי לוי | **VERIFIED** | https://url.publishedprices.co.il/login | HTTPS portal (session + JSON listing) | 3 | 13591 | 13591 | יופלה יוגורט גו קרמי (7290110328764): 6.40 ILS at באר שבע | PriceFull7290058140886-001-027-20261105-180011.gz |
| קרפור | **VERIFIED** | https://prices.carrefour.co.il/ | HTML page with embedded JSON listing | 5 | 11786 | 11786 | צלחות ריו גדול לבן כ (7290019375371): 14.90 ILS at סינמה סיטי | PriceFull7290055700007-001-117-20261105-051004.gz |
| יוחננוף | **VERIFIED** | https://url.publishedprices.co.il/login | HTTPS portal (session + JSON listing) | 1 | 11327 | 11323 | רדיד אלומיניום נון ס (10900678148): 14.90 ILS at באר שבע | PriceFull7290803800003-000-040-20261105-004031.gz |
| ויקטורי | **VERIFIED** | https://laibcatalog.co.il/webapi/api/getfiles | JSON API | 1 | 9725 | 9724 | שום תפזורת תוצרת סין (7290000000459): 29.9 ILS at באר שבע | PriceFull7290696200003-001-068-20261105-050438.gz |
| אושר עד | **VERIFIED** | https://url.publishedprices.co.il/login | HTTPS portal (session + JSON listing) | 1 | 6097 | 6097 | יין אור הגנוז עמוקה (7290013303349): 59.90 ILS at באר שבע | PriceFull7290103152017-001-013-20261105-141502.gz |
| מחסני השוק | **VERIFIED** | https://laibcatalog.co.il/webapi/api/getfiles | JSON API | 10 | 13373 | 13372 | גזר ארוז (7290018825006): 3.9 ILS at 1 ב"ש-בית אשל | PriceFull7290661400001-001-001-20261105-041923.gz |

## Step detail

### שופרסל (shufersal): VERIFIED

- pass: `list_files`: 1 files listed
- pass: `download_stores`: Stores7290027600007-000-20261105-020.gz, 12659 bytes
- pass: `parse_stores`: 417 stores, 9 in Be'er Sheva
- pass: `download_prices`: PriceFull7290027600007-002-248-20261105-030000.gz, 385526 bytes
- pass: `parse_and_validate_prices`: {"items": 7621, "validPrices": 7621, "validShare": 1.0, "globalBarcodes": 7610, "ok": true}
- pass: `extract_real_product`: שקיות זיפר M 25 יחידות = 16.90 ILS
- pass: `parse_promotions`: PromoFull7290027600007-002-248-20261105-030000.gz: 1388 promotions, 1388 with items
- pass: `freshness`: file age 17.4h, limit 48h
- Database: 255 products, 2030 valid prices, last successful import 2026-11-05T19:54:33.417000+02:00

### רמי לוי (rami-levy): VERIFIED

- pass: `list_files`: 2622 files listed
- pass: `download_stores`: Stores7290058140886-000-20261105-050500.xml, 38638 bytes
- pass: `parse_stores`: 99 stores, 3 in Be'er Sheva
- pass: `download_prices`: PriceFull7290058140886-001-027-20261105-180011.gz, 1019290 bytes
- pass: `parse_and_validate_prices`: {"items": 13591, "validPrices": 13591, "validShare": 1.0, "globalBarcodes": 13591, "ok": true}
- pass: `extract_real_product`: יופלה יוגורט גו קרמי = 6.40 ILS
- pass: `parse_promotions`: PromoFull7290058140886-001-027-20261105-180105.gz: 2405 promotions, 2405 with items
- pass: `freshness`: file age 2.4h, limit 48h
- Database: 278 products, 741 valid prices, last successful import 2026-11-05T19:54:42.554000+02:00

### קרפור (carrefour): VERIFIED

- pass: `list_files`: 1562 files listed
- pass: `download_stores`: Stores7290055700007-000-20261105-000100.xml, 61394 bytes
- pass: `parse_stores`: 147 stores, 5 in Be'er Sheva
- pass: `download_prices`: PriceFull7290055700007-001-117-20261105-051004.gz, 875811 bytes
- pass: `parse_and_validate_prices`: {"items": 11786, "validPrices": 11786, "validShare": 1.0, "globalBarcodes": 11558, "ok": true}
- pass: `extract_real_product`: צלחות ריו גדול לבן כ = 14.90 ILS
- pass: `parse_promotions`: PromoFull7290055700007-001-117-20261105-051118.gz: 1689 promotions, 1689 with items
- pass: `freshness`: file age 15.3h, limit 48h
- Database: 286 products, 1354 valid prices, last successful import 2026-11-05T19:54:48.401000+02:00

### יוחננוף (yochananof): VERIFIED

- pass: `list_files`: 1134 files listed
- pass: `download_stores`: Stores7290803800003-000-20261105-010000.xml, 19636 bytes
- pass: `parse_stores`: 51 stores, 1 in Be'er Sheva
- pass: `download_prices`: PriceFull7290803800003-000-040-20261105-004031.gz, 512362 bytes
- pass: `parse_and_validate_prices`: {"items": 11327, "validPrices": 11323, "validShare": 0.9996, "globalBarcodes": 10745, "ok": true}
- pass: `extract_real_product`: רדיד אלומיניום נון ס = 14.90 ILS
- pass: `parse_promotions`: PromoFull7290803800003-000-040-20261105-004031.gz: 1240 promotions, 1240 with items
- pass: `freshness`: file age 19.8h, limit 48h
- Database: 288 products, 288 valid prices, last successful import 2026-11-05T19:54:51.706000+02:00

### ויקטורי (victory): VERIFIED

- pass: `list_files`: 2076 files listed
- pass: `download_stores`: Stores7290696200003-000-20261105060100-060100.gz, 2473 bytes
- pass: `parse_stores`: 70 stores, 1 in Be'er Sheva
- pass: `download_prices`: PriceFull7290696200003-001-068-20261105-050438.gz, 541176 bytes
- pass: `parse_and_validate_prices`: {"items": 9725, "validPrices": 9724, "validShare": 0.9999, "globalBarcodes": 8664, "ok": true}
- pass: `extract_real_product`: שום תפזורת תוצרת סין = 29.9 ILS
- pass: `parse_promotions`: PromoFull7290696200003-001-068-20261105-050449.gz: 4030 promotions, 4030 with items
- pass: `freshness`: file age 15.4h, limit 48h
- Database: 282 products, 282 valid prices, last successful import 2026-11-05T19:55:08.677000+02:00

### אושר עד (osher-ad): VERIFIED

- pass: `list_files`: 392 files listed
- pass: `download_stores`: Stores7290103152017-000-20261105-080500.xml, 9790 bytes
- pass: `parse_stores`: 24 stores, 1 in Be'er Sheva
- pass: `download_prices`: PriceFull7290103152017-001-013-20261105-141502.gz, 466882 bytes
- pass: `parse_and_validate_prices`: {"items": 6097, "validPrices": 6097, "validShare": 1.0, "globalBarcodes": 6097, "ok": true}
- pass: `extract_real_product`: יין אור הגנוז עמוקה = 59.90 ILS
- pass: `parse_promotions`: PromoFull7290103152017-001-013-20261105-141522.gz: 751 promotions, 751 with items
- pass: `freshness`: file age 6.2h, limit 48h
- Database: 234 products, 234 valid prices, last successful import 2026-11-05T19:55:10.070000+02:00

### מחסני השוק (mahsanei-hashuk): VERIFIED

- pass: `list_files`: 1243 files listed
- pass: `download_stores`: Stores7290661400001-000-20261105060100-060100.gz, 2735 bytes
- pass: `parse_stores`: 71 stores, 10 in Be'er Sheva
- pass: `download_prices`: PriceFull7290661400001-001-001-20261105-041923.gz, 721896 bytes
- pass: `parse_and_validate_prices`: {"items": 13373, "validPrices": 13372, "validShare": 0.9999, "globalBarcodes": 10883, "ok": true}
- pass: `extract_real_product`: גזר ארוז = 3.9 ILS
- pass: `parse_promotions`: PromoFull7290661400001-001-001-20261105-041941.gz: 5015 promotions, 5015 with items
- pass: `freshness`: file age 16.1h, limit 48h
- Database: 275 products, 2586 valid prices, last successful import 2026-11-05T20:24:06.498000+02:00

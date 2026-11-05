# Data source research

Checked with live requests on 2026-11-05. The results of the automated checks are in
[`verification/connector-test-report.md`](../verification/connector-test-report.md).

## Sources in use: the chains' official transparency files

Israel's Food Act (Promotion of Competition in the Food Sector Law) requires large chains to
publish price, promotion and store files for every branch. Each connector reads its chain's
own publication. There is no shared API, and each portal differs.

| Chain | Portal | Access | Files |
|---|---|---|---|
| Shufersal | prices.shufersal.co.il | HTML listing per category and store, signed Azure blob links that expire | GZ XML |
| Rami Levy | url.publishedprices.co.il | Session plus JSON listing. Public username `RamiLevi`, empty password | GZ XML, stores as UTF-16 XML |
| Yochananof | url.publishedprices.co.il | Same portal, username `yohananof` | GZ XML |
| Osher Ad | url.publishedprices.co.il | Same portal, username `osherad` | GZ XML |
| Carrefour | prices.carrefour.co.il | JSON listing embedded in the page, files in a dated folder | GZ XML, stores as XML |
| Victory | laibcatalog.co.il | JSON API (`getbranches`, `getfiles`) | GZ XML |
| Mahsanei Hashuk | laibcatalog.co.il | Same API, chain code `7290661400001` | GZ XML |

Notes:

- The `publishedprices` usernames are the chains' public disclosure, not private accounts. They
  are listed in open-source projects that read the same files. No password or CAPTCHA is
  involved, and none is bypassed.
- The same portal also offers FTP (`url.retail.publishedprices.co.il`). Login worked from here
  but the data connection timed out, so the connectors use the HTTPS route.
- `matrixcatalog.co.il`, an older address for the Laib portal, did not respond.
- Chain codes and portal details were cross-checked against the open-source project
  [OpenIsraeliSupermarkets/israeli-supermarket-scarpers](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers).
  No code from it is used here.

### Update frequency

Full files appear daily and partial `Price` files several times a day, depending on the chain.
The engine applies the newest full file, then any newer partial files.

### Terms and limits

The regulations page on gov.il could not be read automatically because it sits behind a
Cloudflare challenge (HTTP 403), and that challenge was not bypassed. **The exact terms of use
were therefore not reviewed**, and the law and any portal terms should be read by a person before
commercial launch.

Some sources are reported to block addresses outside Israel, so production imports may need a
server in Israel.

## Sources checked and not used

| Source | Finding | Decision |
|---|---|---|
| data.gov.il | `package_search` for "סופרמרקט" and "supermarket prices" returned 0 datasets | No usable dataset |
| pricez.co.il | A live commercial comparison site. Its robots.txt restricts crawlers. No public API was found | Not used: republishing another comparison site's data has no verifiable provenance |
| pricecheck.co.il | A live commercial comparison site. Its robots.txt disallows `/api/` and `/compare` | Not used, same reason |

## Product images

Photos come from Open Food Facts, Open Beauty Facts and Open Products Facts by barcode, under
CC BY-SA, with attribution in each product's window and in `database/catalog/images.json`.
Coverage of Israeli products there is thin. Everything else shows a generated placeholder.
Images were not taken from chain websites, whose reuse terms are unknown.

## How to add a source or a city

- **New chain:** add a class in `data-engine/supersave_engine/connectors/portals.py` and register
  it in `ALL_CONNECTORS`. The seed step, verification and dashboard pick it up automatically.
- **New city:** extend `is_beer_sheva` in `pricing.py` to a configurable locality list. Branches
  already store their city, and locality codes come from the chains' Stores files.

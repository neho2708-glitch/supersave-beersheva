"""Offline tests for parsing, normalization, matching and promotion rules.

The XML samples copy the real dialects seen in the chains' files, with neutral values.
"""
import gzip
from datetime import datetime
from decimal import Decimal

import pytest

from supersave_engine import feed
from supersave_engine.connectors.base import classify
from supersave_engine.fresh_rules import match_fresh
from supersave_engine.matching import Matcher, build_product
from supersave_engine.normalize import canonical_unit, is_global_barcode, normalize_name, price_per_unit, size_from_name
from supersave_engine.pricing import is_beer_sheva, promo_terms

PRICE_XML = """<?xml version="1.0" encoding="utf-8"?>
<Root><ChainID>7290000000000</ChainID><SubChainID>001</SubChainID><StoreID>027</StoreID><BikoretNo>5</BikoretNo>
<Items>
<Item><PriceUpdateTime>2026-10-12T19:13:39.000</PriceUpdateTime><ItemCode>7290000000017</ItemCode><ItemType>1</ItemType>
<ItemName>קוטג 5% 250 גרם</ItemName><ManufactureName>תנובה</ManufactureName><UnitQty>גרם</UnitQty><Quantity>250.00</Quantity>
<UnitOfMeasure>100 גרם</UnitOfMeasure><bIsWeighted>0</bIsWeighted><ItemPrice>6.10</ItemPrice><UnitOfMeasurePrice>2.44</UnitOfMeasurePrice>
<LastSaleDateTime>2026-11-04T10:00:00.000</LastSaleDateTime></Item>
<Item><ItemCode>530</ItemCode><ItemType>0</ItemType><ItemName>בננה</ItemName><UnitQty>קילוגרם</UnitQty><Quantity>1</Quantity>
<bIsWeighted>1</bIsWeighted><ItemPrice>9.9</ItemPrice></Item>
<Item><ItemCode></ItemCode><ItemName>no code</ItemName><ItemPrice>1</ItemPrice></Item>
</Items></Root>"""

PROMO_XML = """<Root><ChainID>7290000000000</ChainID><StoreID>027</StoreID><Promotions>
<Promotion><PromotionUpdateTime>2026-11-04T00:00:00.000</PromotionUpdateTime><PromotionID>0001</PromotionID>
<PromotionDescription>קוטג 2ב10</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime>
<PromotionEndDateTime>2026-12-05T23:59:00.000</PromotionEndDateTime><ClubID>0 - כלל הלקוחות</ClubID><AdditionalIsCoupon>0</AdditionalIsCoupon>
<Groups><Group><MinPurchaseAmount>0.00</MinPurchaseAmount><PromotionItems><PromotionItem><ItemCode>7290000000017</ItemCode><ItemType>1</ItemType>
<RewardType>10</RewardType><MinQty>2.00</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>10.00</DiscountedPrice>
<DiscountedPricePerMida>5.00</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem></PromotionItems></Group></Groups>
</Promotion></Promotions></Root>"""

STORES_XML = """<Root><ChainID>7290000000000</ChainID><SubChains><SubChain><SubChainID>002</SubChainID><SubChainName>דיל</SubChainName>
<Stores><Store><StoreID>248</StoreID><StoreName>דיל ב"ש</StoreName><Address>החשמונאים 15</Address><City>9000</City></Store></Stores>
</SubChain></SubChains></Root>"""


class TestDecoding:
    def test_gzip_and_utf16(self):
        payload = gzip.compress(PRICE_XML.replace('encoding="utf-8"', 'encoding="utf-16"').encode("utf-16"))
        _, items = feed.parse_prices(payload)
        assert items[0].name == "קוטג 5% 250 גרם"

    def test_windows_1255(self):
        xml = '<?xml version="1.0" encoding="windows-1255"?><Root><Items><Item><ItemCode>1</ItemCode><ItemName>בננה</ItemName></Item></Items></Root>'
        _, items = feed.parse_prices(xml.encode("windows-1255"))
        assert items[0].name == "בננה"

    @pytest.mark.parametrize("bad", [b"", b"   ", b"<html><body", b"not xml at all"])
    def test_rejects_garbage(self, bad):
        with pytest.raises(feed.FeedError):
            feed.parse_prices(bad)

    def test_refuses_entity_expansion(self):
        evil = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><Root><Items><Item><ItemCode>1</ItemCode><ItemName>&b;</ItemName></Item></Items></Root>'
        evil = evil.replace(b'<?xml version="1.0"?>', b"")
        with pytest.raises(feed.FeedError):
            feed.parse_prices(evil)


class TestParsing:
    def test_prices(self):
        header, items = feed.parse_prices(PRICE_XML.encode())
        assert header["store_id"] == "027"
        assert len(items) == 2  # the record with no code is dropped
        first = items[0]
        assert first.price == Decimal("6.10")
        assert first.manufacturer == "תנובה"
        assert first.price_updated_at == datetime(2026, 10, 12, 19, 13, 39)
        assert first.last_sale_at == datetime(2026, 11, 4, 10, 0)
        assert items[1].is_weighted is True

    def test_promotions_read_nested_items(self):
        _, promos = feed.parse_promotions(PROMO_XML.encode())
        promo = promos[0]
        assert promo.club_id == "0"
        assert promo.requires_club is False
        assert promo.ends_at == datetime(2026, 12, 5, 23, 59)
        assert promo.items[0].min_qty == Decimal("2.00")
        assert promo.items[0].discounted_price == Decimal("10.00")

    def test_stores_inherit_subchain(self):
        stores = feed.parse_stores(STORES_XML.encode())
        assert stores[0].subchain_name == "דיל"
        assert stores[0].store_id == "248"

    def test_stores_empty_is_an_error(self):
        with pytest.raises(feed.FeedError):
            feed.parse_stores(b"<Root><ChainID>1</ChainID></Root>")


class TestFileNames:
    @pytest.mark.parametrize(
        "name,kind,store,stamp",
        [
            ("PriceFull7290058140886-001-027-20261105-060006.gz", "pricefull", "27", datetime(2026, 11, 5, 6, 0)),
            ("Stores7290696200003-000-20261105060100-060100.gz", "stores", None, datetime(2026, 11, 5, 6, 1)),
            ("Stores7290055700007-000-20261105-000100.xml", "stores", None, datetime(2026, 11, 5, 0, 1)),
            ("Promo7290696200003-001-069-20261105-160754.gz", "promo", "69", datetime(2026, 11, 5, 16, 7)),
            ("Stores7290027600007-000-20261105-020.gz", "stores", None, datetime(2026, 11, 5)),
        ],
    )
    def test_classify(self, name, kind, store, stamp):
        parsed = classify(name, "https://example.test/" + name)
        assert parsed.kind == kind
        assert parsed.store_code == store
        assert parsed.published_at == stamp

    def test_unknown_file_is_ignored(self):
        assert classify("readme.txt", "u") is None


class TestNormalization:
    def test_units(self):
        assert canonical_unit(Decimal(1), "קילוגרם").amount == 1000
        assert canonical_unit(Decimal("1.5"), "ליטר").unit == "ml"
        assert canonical_unit(Decimal(100), 'מ"ל').amount == 100
        assert canonical_unit(Decimal(1), "לא ידוע") is None
        assert canonical_unit(Decimal(0), "גרם") is None

    def test_size_from_name(self):
        assert size_from_name("במבה 80 גרם").amount == 80
        assert size_from_name('שמן 1 ליטר').amount == 1000
        assert size_from_name("קוטג בלי גודל") is None

    def test_barcode_rule(self):
        assert is_global_barcode("7290000000017", "1")
        assert not is_global_barcode("530", "1")  # too short
        assert not is_global_barcode("7290000000017", "0")  # private to the chain

    def test_unit_price(self):
        assert price_per_unit(Decimal("10"), canonical_unit(Decimal(500), "גרם"))[0] == Decimal("2.00")
        assert price_per_unit(Decimal("0"), canonical_unit(Decimal(500), "גרם")) is None

    def test_name(self):
        assert normalize_name('תפו"א  לבן!') == "תפוא לבן"


def item(code="7290000000017", name="קוטג 5% 250 גרם", weighted=False, kind="1", quantity="250", unit="גרם", maker="תנובה", price="6"):
    return feed.ItemRecord(
        item_code=code, name=name, manufacturer=maker, quantity=Decimal(quantity) if quantity else None, unit=unit,
        unit_of_measure="", is_weighted=weighted, price=Decimal(price), unit_price=None, price_updated_at=None,
        item_status="", item_type=kind, raw={},
    )


@pytest.fixture
def matcher():
    return Matcher([
        build_product({"id": "7290000000017", "barcode": "7290000000017", "nameHe": "קוטג 5% 250 גרם", "brand": "תנובה", "sizeAmount": 250, "sizeUnit": "g", "soldByWeight": False}),
        build_product({"id": "7290000000024", "barcode": "7290000000024", "nameHe": "קוטג 9% 250 גרם", "brand": "תנובה", "sizeAmount": 250, "sizeUnit": "g", "soldByWeight": False}),
    ])


class TestMatching:
    def test_barcode_wins(self, matcher):
        result = matcher.match(item(name="שם שונה לגמרי"))
        assert result.status == "MATCHED" and result.method == "BARCODE"

    def test_internal_code_never_matches_a_barcode(self, matcher):
        # Same digits but ItemType 0, and a name unrelated to the product.
        assert matcher.match(item(kind="0", name="משהו אחר")) is None

    def test_different_size_is_not_merged(self, matcher):
        assert matcher.match(item(code="111", kind="0", quantity="500")) is None

    def test_same_barcode_different_named_size_goes_to_review(self, matcher):
        result = matcher.match(item(name="קוטג 5% 500 גרם", quantity="500"))
        assert result.status == "REVIEW"

    def test_weight_mismatch_goes_to_review(self, matcher):
        assert matcher.match(item(weighted=True)).status == "REVIEW"

    def test_near_name_goes_to_review_not_auto(self, matcher):
        result = matcher.match(item(code="111", kind="0", name="קוטג 5% 250 גר", maker="תנובה"))
        assert result.status == "REVIEW"

    def test_exact_name_brand_size_auto_matches(self, matcher):
        result = matcher.match(item(code="111", kind="0"))
        assert result.status == "MATCHED" and result.method == "BRAND_SIZE_FUZZY"

    def test_exact_name_other_brand_is_only_review(self, matcher):
        result = matcher.match(item(code="111", kind="0", maker="אחר"))
        assert result.status == "REVIEW"


class TestFreshRules:
    def test_matches_exact_names_only(self):
        assert match_fresh("בננה", True, 9.9)["id"] == "fresh-banana"
        assert match_fresh("עגבניה ישראל", True, 7)["id"] == "fresh-tomato"
        assert match_fresh("בננה אורגנית", True, 19) is None
        assert match_fresh("בננה ציפס במשקל", True, 49) is None

    def test_needs_weight_and_sane_price(self):
        assert match_fresh("בננה", False, 9.9) is None
        assert match_fresh("בננה", True, 99) is None


def store(city="9000", name="סניף", subchain=""):
    return feed.StoreRecord(chain_id="1", subchain_id="1", store_id="1", name=name, address="", city=city, zip_code="", bikoret="", subchain_name=subchain)


class TestBeerSheva:
    def test_city_code(self):
        assert is_beer_sheva(store("9000"))
        assert is_beer_sheva(store("באר שבע"))

    def test_neighbouring_town_is_excluded_even_with_bs_in_the_name(self):
        assert not is_beer_sheva(store("666", 'שלי ב"ש- עומר'))
        assert not is_beer_sheva(store("1271", "אקספרס להבים באר שבע"))

    def test_missing_city_falls_back_to_name(self):
        assert is_beer_sheva(store("0", "באר שבע"))
        assert not is_beer_sheva(store("0", "מפוח"))

    def test_non_supermarket_formats_are_excluded(self):
        assert not is_beer_sheva(store("9000", "BE באר שבע", "Be"))
        assert not is_beer_sheva(store("9000", "סיטונאות", "Cash&Carry"))


def promotion(description="2ב10", coupon=False):
    return feed.PromotionRecord(
        promotion_id="1", description=description, starts_at=None, ends_at=None, updated_at=None, club_id="0",
        requires_club=False, is_coupon=coupon, remarks="", items=[], raw={},
    )


def promo_item(reward="10", qty="2", price="10", minimum=None):
    return feed.PromotionItemRecord(
        item_code="1", item_type="1", reward_type=reward, min_qty=Decimal(qty), max_qty=None,
        discounted_price=Decimal(price) if price else None, discounted_price_per_unit=None, discount_rate=None,
        is_weighted=False, min_purchase_amount=Decimal(minimum) if minimum else None,
    )


class TestPromoTerms:
    def test_bundle_price_is_divided(self):
        terms = promo_terms(promotion(), promo_item(), Decimal("7"))
        assert terms.computable and terms.unit_price == Decimal("5.00")

    @pytest.mark.parametrize(
        "promo,line,regular",
        [
            (promotion(coupon=True), promo_item(), "7"),
            (promotion("מתנה לקונה"), promo_item(), "7"),
            (promotion(), promo_item(minimum="100"), "7"),
            (promotion(), promo_item(reward="3"), "7"),
            (promotion(), promo_item(price=None), "7"),
            (promotion(), promo_item(), "4"),  # not actually cheaper
            (promotion(), promo_item(price="1"), "20"),  # absurdly low, needs review
        ],
    )
    def test_unsafe_terms_are_not_computed(self, promo, line, regular):
        terms = promo_terms(promo, line, Decimal(regular))
        assert not terms.computable and terms.unit_price is None and terms.reason

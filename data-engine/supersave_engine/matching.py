"""Product matching, in the required priority order:

1. Barcode (ItemType 1 only; ItemType 0 codes are private to a chain).
2. Brand.
3. Weight / volume.
4. Fuzzy name.

Steps 2-4 only run together: a fuzzy hit needs the same size, and auto-accepting also
needs the same brand. Different sizes or variants are never merged. Anything not
certain goes to the review queue and shows no price until a person approves it.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from rapidfuzz import fuzz

from .feed import ItemRecord
from .fresh_rules import match_fresh
from .normalize import Size, is_global_barcode, item_size, normalize_name

AUTO_SCORE = 97.0
REVIEW_SCORE = 85.0


@dataclass(frozen=True)
class CatalogProduct:
    id: str
    barcode: str | None
    name: str
    normalized_name: str
    brand: str | None
    normalized_brand: str
    size: Size | None
    sold_by_weight: bool


@dataclass(frozen=True)
class MatchResult:
    status: str  # MATCHED | REVIEW
    method: str
    product_id: str
    score: float
    reason: str


def _brand_norm(brand: str | None) -> str:
    return normalize_name(brand or "")


def build_product(row: dict) -> CatalogProduct:
    size = None
    if row.get("sizeAmount") and row.get("sizeUnit"):
        size = Size(Decimal(str(row["sizeAmount"])), row["sizeUnit"])
    return CatalogProduct(
        id=row["id"],
        barcode=row.get("barcode"),
        name=row["nameHe"],
        normalized_name=normalize_name(row["nameHe"]),
        brand=row.get("brand"),
        normalized_brand=_brand_norm(row.get("brand")),
        size=size,
        sold_by_weight=bool(row.get("soldByWeight")),
    )


class Matcher:
    def __init__(self, products: list[CatalogProduct]):
        self.by_barcode = {p.barcode: p for p in products if p.barcode}
        self.by_size: dict[tuple[str, str], list[CatalogProduct]] = {}
        for product in products:
            if product.size and not product.sold_by_weight:
                key = (product.size.unit, str(int(product.size.amount)))
                self.by_size.setdefault(key, []).append(product)

    def match(self, item: ItemRecord) -> MatchResult | None:
        # 1. Barcode.
        if is_global_barcode(item.item_code, item.item_type):
            product = self.by_barcode.get(item.item_code)
            if product:
                return self._check_barcode_hit(item, product)

        # Fresh goods: rule-based, only when sold by weight.
        price = float(item.price) if item.price is not None else 0.0
        fresh = match_fresh(normalize_name(item.name), item.is_weighted, price)
        if fresh:
            return MatchResult("MATCHED", "FRESH_RULE", fresh["id"], 100.0, "exact name rule")

        # 2-4. Brand, size and fuzzy name, for items with no shared barcode.
        size = item_size(item)
        if size is None or item.is_weighted:
            return None
        candidates = self.by_size.get((size.unit, str(int(size.amount))))
        if not candidates:
            return None
        normalized = normalize_name(item.name)
        best: tuple[float, CatalogProduct] | None = None
        for product in candidates:
            score = fuzz.token_sort_ratio(normalized, product.normalized_name)
            if best is None or score > best[0]:
                best = (score, product)
        if best is None or best[0] < REVIEW_SCORE:
            return None
        score, product = best
        same_brand = bool(product.normalized_brand) and _brand_norm(item.manufacturer) == product.normalized_brand
        # A catalogue product with a real barcode that this chain lists under another code
        # could be a different pack, so it is reviewed unless brand, size and name all agree.
        if score >= AUTO_SCORE and same_brand:
            return MatchResult("MATCHED", "BRAND_SIZE_FUZZY", product.id, score, "brand, size and name agree")
        return MatchResult("REVIEW", "BRAND_SIZE_FUZZY", product.id, score, "name is similar but not certain")

    @staticmethod
    def _check_barcode_hit(item: ItemRecord, product: CatalogProduct) -> MatchResult:
        if item.is_weighted != product.sold_by_weight:
            return MatchResult(
                "REVIEW", "BARCODE", product.id, 100.0, "one side is sold by weight, the other by package"
            )
        size = item_size(item)
        if (
            not product.sold_by_weight
            and size
            and product.size
            and size.unit == product.size.unit
            and size.unit != "unit"
            and not size.same_as(product.size, Decimal("0.05"))
        ):
            # Chains often leave wrong package metadata on a correct barcode. The barcode is
            # the stronger signal, unless the name also says the size differs.
            from .normalize import size_from_name

            named = size_from_name(item.name)
            if named and named.unit == product.size.unit and not named.same_as(product.size, Decimal("0.05")):
                return MatchResult("REVIEW", "BARCODE", product.id, 100.0, "same barcode but a different size")
        return MatchResult("MATCHED", "BARCODE", product.id, 100.0, "barcode")

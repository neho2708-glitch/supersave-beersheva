"""Normalization of raw feed items to one comparable shape."""
from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from .feed import ItemRecord

_GRAM = ("גרם", "גר", "ג", "גר'", "ג'", "gr", "g")
_KG = ("קילוגרם", "קילו", "קג", 'ק"ג', "ק״ג", "ק.ג", "kg")
_ML = ("מיליליטר", 'מ"ל', "מ״ל", "מל", "מ.ל", "ml", 'מ"ל.')
_LITER = ("ליטר", "ל", "ל'", "lt", "l")
_UNIT = ("יחידה", "יחידות", "יח", "יח'", "יחי", "unit")

SIZE_RE = re.compile(
    r"(?<![\d.])(\d+(?:\.\d+)?)\s*"
    r"(קילוגרם|ק\"ג|ק״ג|קג|קילו|גרם|גר'?|ג'|מיליליטר|מ\"ל|מ״ל|מל|ליטר|יחידות|יח'?)(?![א-ת])"
)
MULTIPACK_RE = re.compile(r"(?:(\d+)\s*[*xX×]\s*)(\d+(?:\.\d+)?)")

_PUNCT_RE = re.compile(r"[^\w\s%.]", re.UNICODE)
_SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class Size:
    amount: Decimal
    unit: str  # g | ml | unit

    def same_as(self, other: "Size", tolerance: Decimal = Decimal("0.02")) -> bool:
        if self.unit != other.unit or other.amount == 0:
            return False
        return abs(self.amount - other.amount) / other.amount <= tolerance


def canonical_unit(amount: Decimal | None, unit: str) -> Size | None:
    """Convert an (amount, unit) pair to grams / millilitres / units."""
    if amount is None or amount <= 0:
        return None
    cleaned = unit.strip().lower().replace(" ", "")
    if cleaned in _GRAM:
        return Size(amount, "g")
    if cleaned in _KG:
        return Size(amount * 1000, "g")
    if cleaned in _ML:
        return Size(amount, "ml")
    if cleaned in _LITER:
        return Size(amount * 1000, "ml")
    if cleaned in _UNIT:
        return Size(amount, "unit")
    return None


def size_from_name(name: str) -> Size | None:
    match = SIZE_RE.search(name)
    if not match:
        return None
    return canonical_unit(Decimal(match.group(1)), match.group(2))


def item_size(item: ItemRecord) -> Size | None:
    """Best known package size for an item.

    Declared metadata wins, except for the "1 unit" placeholder which many chains
    use for everything; there the size printed in the name is more informative.
    """
    declared = canonical_unit(item.quantity, item.unit)
    from_name = size_from_name(item.name)
    if declared and declared.unit != "unit":
        return declared
    if from_name:
        return from_name
    return declared


def normalize_name(name: str) -> str:
    """Lower-cased Hebrew/Latin text with punctuation and quotes removed."""
    text = name.replace('"', "").replace("״", "").replace("'", "").replace("׳", "")
    text = _PUNCT_RE.sub(" ", text.lower())
    return _SPACE_RE.sub(" ", text).strip()


def is_global_barcode(code: str, item_type: str = "1") -> bool:
    """A cross-chain barcode: ItemType 1 and an EAN/UPC-length numeric code.

    ItemType 0 means a code internal to the chain. Two chains can use the same
    internal number for different goods, so it must never be matched across chains.
    """
    return item_type == "1" and code.isdigit() and 8 <= len(code) <= 14


def price_per_unit(price: Decimal, size: Size | None) -> tuple[Decimal, str] | None:
    """Comparable price: per 100 g, per 100 ml, or per unit."""
    if size is None or size.amount <= 0 or price <= 0:
        return None
    if size.unit == "g":
        return (price / size.amount * 100).quantize(Decimal("0.01")), "100 גרם"
    if size.unit == "ml":
        return (price / size.amount * 100).quantize(Decimal("0.01")), "100 מ\"ל"
    return (price / size.amount).quantize(Decimal("0.01")), "יחידה"

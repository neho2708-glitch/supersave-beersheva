"""Promotion interpretation and store filtering. Pure functions, unit-tested."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from .feed import PromotionItemRecord, PromotionRecord, StoreRecord

ISRAEL = ZoneInfo("Asia/Jerusalem")
BEER_SHEVA_CODE = "9000"  # Central Bureau of Statistics locality code
BEER_SHEVA_RE = re.compile(r'באר[\s-]?שבע|ב"ש|ב״ש')
# Reward types whose DiscountedPrice is the total price for MinQty units; verified against
# descriptions like "2ב20" in the live files. Other types are shown as text only.
COMPUTABLE_REWARD_TYPES = {"1", "10"}
# Formats in Be'er Sheva that are not supermarkets (drugstore, wholesale).
EXCLUDED_SUBCHAINS = re.compile(r"^Be$|Cash&Carry|סיטונאות", re.IGNORECASE)


def to_israel(value: datetime | None) -> datetime | None:
    """Feed timestamps are Israel local time with no offset."""
    if value is None:
        return None
    return value.replace(tzinfo=ISRAEL) if value.tzinfo is None else value


def is_beer_sheva(store: StoreRecord) -> bool:
    city = store.city.strip()
    if city == BEER_SHEVA_CODE or BEER_SHEVA_RE.fullmatch(city):
        located = True
    elif city in ("", "0", "unknown", "לא ידוע"):
        # Some chains leave the city empty, then the store name is the only evidence.
        located = bool(BEER_SHEVA_RE.search(store.name))
    else:
        located = False
    if not located:
        return False
    return not EXCLUDED_SUBCHAINS.search(store.subchain_name or "")


@dataclass(frozen=True)
class PromoTerms:
    computable: bool
    unit_price: Decimal | None
    reason: str | None


def promo_terms(promo: PromotionRecord, item: PromotionItemRecord, regular: Decimal | None) -> PromoTerms:
    """Decide whether a promotion can be turned into a price, and at what per-item price.

    A promotion we cannot interpret safely is kept and shown as text, but never changes
    a computed price. Saying less is better than showing a saving that is not real.
    """
    if promo.is_coupon:
        return PromoTerms(False, None, "מותנה בקופון")
    if "מתנה" in promo.description:
        return PromoTerms(False, None, "הטבת מתנה")
    if item.min_purchase_amount and item.min_purchase_amount > 0:
        return PromoTerms(False, None, "מותנה בסכום קנייה")
    if item.reward_type not in COMPUTABLE_REWARD_TYPES:
        return PromoTerms(False, None, "סוג הטבה שאינו ניתן לחישוב אוטומטי")
    if item.discounted_price is None or item.discounted_price <= 0:
        return PromoTerms(False, None, "לא צוין מחיר מבצע")
    quantity = item.min_qty if item.min_qty and item.min_qty > 0 else Decimal(1)
    unit = (item.discounted_price / quantity).quantize(Decimal("0.01"))
    if regular is None:
        return PromoTerms(False, None, "אין מחיר רגיל להשוואה")
    if unit >= regular:
        return PromoTerms(False, None, "מחיר המבצע אינו נמוך מהמחיר הרגיל")
    if unit < regular * Decimal("0.2"):
        return PromoTerms(False, None, "מחיר המבצע חריג ודורש בדיקה")
    return PromoTerms(True, unit, None)

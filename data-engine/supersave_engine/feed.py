"""Decoding and parsing of the official price-transparency feeds.

The Israeli Food Act feeds share a loose schema, but every portal has its own
dialect: gzip or zip wrapping, UTF-8 / UTF-16 / windows-1255 text, and different
casing of the same tags. Everything format-specific is contained in this module.
"""
from __future__ import annotations

import gzip
import io
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable
from xml.etree.ElementTree import Element

from defusedxml.ElementTree import fromstring


class FeedError(ValueError):
    """The payload could not be understood as a valid feed."""


def unwrap(payload: bytes) -> bytes:
    """Remove gzip/zip wrapping (possibly nested) from a downloaded payload."""
    for _ in range(3):
        if payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        elif payload[:4] == b"PK\x03\x04":
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                names = archive.namelist()
                if not names:
                    raise FeedError("empty zip archive")
                payload = archive.read(names[0])
        else:
            break
    return payload


def decode_text(raw: bytes) -> str:
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return raw.decode("utf-8-sig")
    head = raw[:200].lower()
    declared = re.search(rb'encoding=["\']([a-z0-9_-]+)["\']', head)
    candidates = [declared.group(1).decode()] if declared else []
    candidates += ["utf-8", "windows-1255"]
    for encoding in candidates:
        try:
            return raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    raise FeedError("could not decode text payload")


def parse_xml(payload: bytes) -> Element:
    raw = unwrap(payload)
    if not raw.strip():
        raise FeedError("empty payload")
    text = decode_text(raw).lstrip("﻿ \r\n\t")
    text = re.sub(r"^<\?xml[^>]*\?>", "", text, count=1)
    if not text.lstrip().startswith("<"):
        raise FeedError(f"payload is not XML: {text[:60]!r}")
    try:
        return fromstring(text)
    except Exception as exc:  # defusedxml raises several distinct types
        raise FeedError(f"malformed XML: {exc}") from exc


def _record(element: Element) -> dict[str, str]:
    """Flatten a record's direct children to a lower-cased tag -> text map."""
    return {child.tag.lower(): (child.text or "").strip() for child in element}


def _iter_tag(root: Element, *names: str) -> Iterable[Element]:
    wanted = {n.lower() for n in names}
    for element in root.iter():
        if element.tag.lower() in wanted:
            yield element


def _root_value(root: Element, *names: str) -> str:
    wanted = {n.lower() for n in names}
    for element in root.iter():
        if element.tag.lower() in wanted and (element.text or "").strip():
            return element.text.strip()
    return ""


def to_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        number = Decimal(cleaned)
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


_DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d/%m/%Y",
    "%Y%m%d",
)


def to_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.strip().split(".")[0].rstrip("Z")
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


@dataclass
class StoreRecord:
    chain_id: str
    subchain_id: str
    store_id: str
    name: str
    address: str
    city: str
    zip_code: str
    bikoret: str
    subchain_name: str = ""
    raw: dict[str, str] = field(default_factory=dict)


@dataclass
class ItemRecord:
    item_code: str
    name: str
    manufacturer: str
    quantity: Decimal | None
    unit: str
    unit_of_measure: str
    is_weighted: bool
    price: Decimal | None
    unit_price: Decimal | None
    price_updated_at: datetime | None
    item_status: str
    item_type: str
    raw: dict[str, str]
    last_sale_at: datetime | None = None


@dataclass
class PromotionItemRecord:
    item_code: str
    item_type: str
    reward_type: str
    min_qty: Decimal | None
    max_qty: Decimal | None
    discounted_price: Decimal | None
    discounted_price_per_unit: Decimal | None
    discount_rate: Decimal | None
    is_weighted: bool
    min_purchase_amount: Decimal | None = None


@dataclass
class PromotionRecord:
    promotion_id: str
    description: str
    starts_at: datetime | None
    ends_at: datetime | None
    updated_at: datetime | None
    club_id: str
    requires_club: bool
    is_coupon: bool
    remarks: str
    items: list[PromotionItemRecord]
    raw: dict[str, str]


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "y", "yes")


def parse_stores(payload: bytes) -> list[StoreRecord]:
    root = parse_xml(payload)
    chain_id = _root_value(root, "ChainId", "ChainID")
    bikoret_root = _root_value(root, "BikoretNo")
    # Sub-chain name is sometimes on a wrapping <SubChain> element.
    subchain_by_store: dict[int, tuple[str, str]] = {}
    for sub in _iter_tag(root, "SubChain"):
        rec = _record(sub)
        for store in _iter_tag(sub, "Store", "STORE"):
            subchain_by_store[id(store)] = (rec.get("subchainid", ""), rec.get("subchainname", ""))

    stores: list[StoreRecord] = []
    for element in _iter_tag(root, "Store", "STORE"):
        rec = _record(element)
        store_id = rec.get("storeid", "")
        if not store_id:
            continue
        sub_id, sub_name = subchain_by_store.get(id(element), ("", ""))
        stores.append(
            StoreRecord(
                chain_id=rec.get("chainid", chain_id),
                subchain_id=rec.get("subchainid", sub_id),
                subchain_name=rec.get("subchainname", sub_name),
                store_id=store_id,
                name=rec.get("storename", ""),
                address=rec.get("address", ""),
                city=rec.get("city", ""),
                zip_code=rec.get("zipcode", ""),
                bikoret=rec.get("bikoretno", bikoret_root),
                raw=rec,
            )
        )
    if not stores:
        raise FeedError("stores file contained no <Store> records")
    return stores


def parse_prices(payload: bytes) -> tuple[dict[str, str], list[ItemRecord]]:
    root = parse_xml(payload)
    header = {
        "chain_id": _root_value(root, "ChainId", "ChainID"),
        "subchain_id": _root_value(root, "SubChainId", "SubChainID"),
        "store_id": _root_value(root, "StoreId", "StoreID"),
    }
    items: list[ItemRecord] = []
    for element in _iter_tag(root, "Item", "Product"):
        rec = _record(element)
        code = rec.get("itemcode", "")
        if not code:
            continue
        name = rec.get("itemname", "") or rec.get("manufactureritemdescription", "")
        items.append(
            ItemRecord(
                item_code=code.lstrip("0") or code,
                name=name,
                manufacturer=rec.get("manufacturename", "") or rec.get("manufacturername", ""),
                quantity=to_decimal(rec.get("quantity")),
                unit=rec.get("unitqty", ""),
                unit_of_measure=rec.get("unitofmeasure", ""),
                is_weighted=_flag(rec.get("bisweighted")),
                price=to_decimal(rec.get("itemprice")),
                unit_price=to_decimal(rec.get("unitofmeasureprice")),
                price_updated_at=to_datetime(rec.get("priceupdatetime") or rec.get("priceupdatedate")),
                last_sale_at=to_datetime(rec.get("lastsaledatetime")),
                item_status=rec.get("itemstatus", ""),
                item_type=rec.get("itemtype", ""),
                raw=rec,
            )
        )
    return header, items


def parse_club_id(value: str) -> str:
    """'0 - all customers' / '0' -> '0'. Anything else names a loyalty club."""
    match = re.match(r"\s*(\d+)", value or "")
    return match.group(1) if match else (value or "").strip()


def parse_promotions(payload: bytes) -> tuple[dict[str, str], list[PromotionRecord]]:
    root = parse_xml(payload)
    header = {
        "chain_id": _root_value(root, "ChainId", "ChainID"),
        "subchain_id": _root_value(root, "SubChainId", "SubChainID"),
        "store_id": _root_value(root, "StoreId", "StoreID"),
    }
    promotions: list[PromotionRecord] = []
    for element in _iter_tag(root, "Promotion", "Sale"):
        rec = _record(element)
        promo_id = rec.get("promotionid", "")
        if not promo_id:
            continue
        items: list[PromotionItemRecord] = []
        for group in _iter_tag(element, "Group"):
            group_rec = _record(group)
            for node in _iter_tag(group, "PromotionItem"):
                item = _record(node)
                code = item.get("itemcode", "")
                if not code:
                    continue
                items.append(
                    PromotionItemRecord(
                        item_code=code.lstrip("0") or code,
                        item_type=item.get("itemtype", ""),
                        reward_type=item.get("rewardtype", ""),
                        min_qty=to_decimal(item.get("minqty")),
                        max_qty=to_decimal(item.get("maxqty")),
                        discounted_price=to_decimal(item.get("discountedprice")),
                        discounted_price_per_unit=to_decimal(item.get("discountedpricepermida")),
                        discount_rate=to_decimal(item.get("discountrate")),
                        is_weighted=_flag(item.get("biswighted") or item.get("bisweighted")),
                        min_purchase_amount=to_decimal(group_rec.get("minpurchaseamount")),
                    )
                )
        club_id = parse_club_id(rec.get("clubid", ""))
        promotions.append(
            PromotionRecord(
                promotion_id=promo_id,
                description=rec.get("promotiondescription", ""),
                starts_at=to_datetime(rec.get("promotionstartdatetime") or rec.get("promotionstartdate")),
                ends_at=to_datetime(rec.get("promotionenddatetime") or rec.get("promotionenddate")),
                updated_at=to_datetime(rec.get("promotionupdatetime") or rec.get("promotionupdatedate")),
                club_id=club_id,
                requires_club=club_id not in ("", "0"),
                is_coupon=_flag(rec.get("additionaliscoupon")),
                remarks=rec.get("remarks", ""),
                items=items,
                raw={k: v for k, v in rec.items() if k != "groups"},
            )
        )
    return header, promotions

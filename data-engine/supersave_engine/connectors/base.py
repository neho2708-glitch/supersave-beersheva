"""Connector contract. One connector per chain; shared portal engines in portals.py."""
from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar

import requests

USER_AGENT = "SuperSave-DataEngine/1.0 (price-transparency open data client)"
TIMEOUT = 60

FILE_RE = re.compile(
    r"^(?P<kind>StoresFull|Stores|Store|PriceFull|Price|PromoFull|Promo)"
    r"(?P<chain>\d+)-(?:(?P<sub>\d+)-)?(?P<store>\d+)-(?P<stamp>\d{8}(?:\d{4,6})?)(?:-(?P<time>\d+))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RemoteFile:
    name: str
    url: str
    kind: str  # stores | pricefull | price | promofull | promo
    store_code: str | None
    published_at: datetime | None
    size: int | None = None


def classify(name: str, url: str, size: int | None = None) -> RemoteFile | None:
    """Parse the standard file name into its parts. Returns None if not a feed file."""
    match = FILE_RE.match(name)
    if not match:
        return None
    kind = match.group("kind").lower()
    if kind.startswith("store"):
        kind = "stores"
    stamp = match.group("stamp")
    time_part = match.group("time") or ""
    published = None
    try:
        if len(stamp) >= 12:
            published = datetime.strptime(stamp[:12], "%Y%m%d%H%M")
        elif len(time_part) >= 4:
            published = datetime.strptime(stamp + time_part[:4], "%Y%m%d%H%M")
        else:
            published = datetime.strptime(stamp, "%Y%m%d")
    except ValueError:
        published = None
    store = None
    if kind != "stores":
        store = match.group("store").lstrip("0") or "0"
    return RemoteFile(name=name, url=url, kind=kind, store_code=store, published_at=published, size=size)


class Connector(ABC):
    slug: ClassVar[str]
    chain_name_he: ClassVar[str]
    chain_name_en: ClassVar[str]
    chain_codes: ClassVar[tuple[str, ...]]
    source_name: ClassVar[str]
    source_url: ClassVar[str]
    connection_type: ClassVar[str]
    file_format: ClassVar[str]
    update_frequency_hours: ClassVar[int] = 24
    terms_note: ClassVar[str] = (
        "Public file published under the Food Act price-transparency regulations."
    )

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self._listing: list[RemoteFile] | None = None
        self.session.headers["User-Agent"] = USER_AGENT

    @abstractmethod
    def list_files(self) -> list[RemoteFile]:
        """Return the files currently offered by the portal."""

    def list_for_store(self, store_code: str) -> list[RemoteFile]:
        """Files for one store. Portals that list everything just filter."""
        if self._listing is None:
            self._listing = self.list_files()
        return [f for f in self._listing if f.store_code == store_code]

    def download(self, remote: RemoteFile) -> bytes:
        response = self.session.get(remote.url, timeout=TIMEOUT)
        response.raise_for_status()
        return response.content

    def latest(
        self, files: list[RemoteFile], kind: str, store_code: str | None = None
    ) -> RemoteFile | None:
        candidates = [
            f
            for f in files
            if f.kind == kind and (store_code is None or f.store_code == store_code)
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda f: (f.published_at or datetime.min, f.name))

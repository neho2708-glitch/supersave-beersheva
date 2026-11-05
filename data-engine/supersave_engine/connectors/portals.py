"""The seven chain connectors, built on the portal families actually in use.

Every endpoint here is exercised by live requests; see verification/.
"""
from __future__ import annotations

import html
import json
import re

from .base import TIMEOUT, Connector, RemoteFile, classify

CSRF_RE = re.compile(r'name="csrftoken" content="([^"]+)"')


class CerberusConnector(Connector):
    """publishedprices.co.il. Chains publish a public username with an empty
    password as part of their legal disclosure; this is not a private account."""

    portal_username: str
    base_url = "https://url.publishedprices.co.il"
    connection_type = "HTTPS portal (session + JSON listing)"
    file_format = "XML in GZ"
    source_name = "Cerberus / publishedprices.co.il"
    source_url = "https://url.publishedprices.co.il/login"

    def _login(self) -> str:
        page = self.session.get(f"{self.base_url}/login", timeout=TIMEOUT)
        page.raise_for_status()
        token = CSRF_RE.search(page.text)
        if not token:
            raise RuntimeError("portal login page has no csrf token")
        done = self.session.post(
            f"{self.base_url}/login/user",
            data={"username": self.portal_username, "password": "", "csrftoken": token.group(1)},
            timeout=TIMEOUT,
        )
        done.raise_for_status()
        if "/login" in done.url:
            raise RuntimeError("portal refused the published public username")
        after = CSRF_RE.search(done.text)
        return after.group(1) if after else token.group(1)

    def list_files(self) -> list[RemoteFile]:
        token = self._login()
        response = self.session.post(
            f"{self.base_url}/file/json/dir",
            data={
                "sEcho": 1,
                "iColumns": 5,
                "sColumns": ",,,,",
                "iDisplayStart": 0,
                "iDisplayLength": 100000,
                "mDataProp_0": "fname",
                "sSearch": "",
                "bRegex": "false",
                "iSortingCols": 0,
                "cd": "/",
                "csrftoken": token,
            },
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        files = []
        for row in response.json().get("aaData", []):
            name = row.get("fname", "")
            parsed = classify(name, f"{self.base_url}/file/d/{name}", row.get("size"))
            if parsed:
                files.append(parsed)
        return files


class RamiLevyConnector(CerberusConnector):
    slug = "rami-levy"
    chain_name_he = "רמי לוי"
    chain_name_en = "Rami Levy"
    chain_codes = ("7290058140886",)
    portal_username = "RamiLevi"


class YochananofConnector(CerberusConnector):
    slug = "yochananof"
    chain_name_he = "יוחננוף"
    chain_name_en = "Yochananof"
    chain_codes = ("7290803800003",)
    portal_username = "yohananof"


class OsherAdConnector(CerberusConnector):
    slug = "osher-ad"
    chain_name_he = "אושר עד"
    chain_name_en = "Osher Ad"
    chain_codes = ("7290103152017",)
    portal_username = "osherad"


class ShufersalConnector(Connector):
    slug = "shufersal"
    chain_name_he = "שופרסל"
    chain_name_en = "Shufersal"
    chain_codes = ("7290027600007",)
    source_name = "prices.shufersal.co.il"
    source_url = "https://prices.shufersal.co.il/"
    connection_type = "HTML listing with signed blob links"
    file_format = "XML in GZ"
    categories = {"stores": 5, "pricefull": 2, "promofull": 4, "price": 1, "promo": 3}
    HREF_RE = re.compile(r'href="(https://[^"]+?\.(?:gz|xml)[^"]*)"', re.IGNORECASE)
    PAGE_RE = re.compile(r"[?&]page=(\d+)")

    def _list_category(
        self, category: int, store_id: str | None = None, max_pages: int = 60
    ) -> list[RemoteFile]:
        files: list[RemoteFile] = []
        page = 1
        last = 1
        while page <= min(last, max_pages):
            params: dict[str, object] = {
                "catID": category,
                "storeId": store_id if store_id else 0,
                "page": page,
            }
            response = self.session.get(
                f"{self.source_url}FileObject/UpdateCategory", params=params, timeout=TIMEOUT
            )
            response.raise_for_status()
            text = response.text
            for href in self.HREF_RE.findall(text):
                url = html.unescape(href)
                name = url.split("?")[0].rsplit("/", 1)[-1]
                parsed = classify(name, url)
                if parsed:
                    files.append(parsed)
            pages = [int(p) for p in self.PAGE_RE.findall(html.unescape(text))]
            last = max(pages) if pages else 1
            page += 1
        return files

    def list_files(self) -> list[RemoteFile]:
        return self._list_category(self.categories["stores"])

    def list_for_store(self, store_code: str) -> list[RemoteFile]:
        files: list[RemoteFile] = []
        for key in ("pricefull", "price", "promofull"):
            files.extend(self._list_category(self.categories[key], store_code, max_pages=3))
        return files


class CarrefourConnector(Connector):
    """prices.carrefour.co.il embeds the listing as JSON in the page; files live in
    a dated folder and the page's own script names that folder."""

    slug = "carrefour"
    chain_name_he = "קרפור"
    chain_name_en = "Carrefour Israel (Yenot Bitan)"
    chain_codes = ("7290055700007",)
    source_name = "prices.carrefour.co.il"
    source_url = "https://prices.carrefour.co.il/"
    connection_type = "HTML page with embedded JSON listing"
    file_format = "XML / XML in GZ"

    def list_files(self) -> list[RemoteFile]:
        response = self.session.get(self.source_url, timeout=TIMEOUT)
        response.raise_for_status()
        response.encoding = "utf-8"
        folder = re.search(r"const path = '([^']+)'", response.text)
        listing = re.search(r"const files = (\[.*?\]);", response.text, re.DOTALL)
        if not folder or not listing:
            raise RuntimeError("carrefour page no longer embeds a file listing")
        files = []
        for row in json.loads(listing.group(1)):
            name = row.get("name", "")
            parsed = classify(name, f"{self.source_url}{folder.group(1)}/{name}", row.get("size"))
            if parsed:
                files.append(parsed)
        return files


class LaibConnector(Connector):
    """laibcatalog.co.il JSON API (Nibit). The API returns the whole chain catalogue."""

    base_url = "https://laibcatalog.co.il"
    source_name = "laibcatalog.co.il (Nibit)"
    source_url = "https://laibcatalog.co.il/webapi/api/getfiles"
    connection_type = "JSON API"
    file_format = "XML in GZ"

    def list_files(self) -> list[RemoteFile]:
        files: list[RemoteFile] = []
        for edi in self.chain_codes:
            branches = self.session.get(
                f"{self.base_url}/webapi/api/getbranches", params={"edi": edi}, timeout=TIMEOUT
            )
            branches.raise_for_status()
            if not branches.json():
                continue
            response = self.session.get(
                f"{self.base_url}/webapi/api/getfiles", params={"edi": edi}, timeout=TIMEOUT
            )
            response.raise_for_status()
            for row in response.json():
                name = row.get("fileName", "")
                parsed = classify(name, f"{self.base_url}/webapi/{edi}/{name}")
                if parsed:
                    files.append(parsed)
        return files


class VictoryConnector(LaibConnector):
    slug = "victory"
    chain_name_he = "ויקטורי"
    chain_name_en = "Victory"
    chain_codes = ("7290696200003", "7290058103393")


class MahsaneiHashukConnector(LaibConnector):
    slug = "mahsanei-hashuk"
    chain_name_he = "מחסני השוק"
    chain_name_en = "Mahsanei Hashuk"
    chain_codes = ("7290661400001", "7290633800006")


ALL_CONNECTORS: tuple[type[Connector], ...] = (
    ShufersalConnector,
    RamiLevyConnector,
    CarrefourConnector,
    YochananofConnector,
    VictoryConnector,
    OsherAdConnector,
    MahsaneiHashukConnector,
)


def get_connector(slug: str) -> Connector:
    for cls in ALL_CONNECTORS:
        if cls.slug == slug:
            return cls()
    raise KeyError(slug)

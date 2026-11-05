"""Fresh produce sold by weight has no barcode shared between chains.

Each generic product here has an anchored name pattern. A chain item matches only if
it is sold by weight, its whole normalized name fits the pattern, and its price per kg
falls in a sanity range. Near misses are never merged; they go to the review queue.

Names are normalized first (see normalize.normalize_name): punctuation and quotes
removed, so 'תפו"א' becomes 'תפוא' and 'עגבניה.' keeps only the trailing dot stripped.
"""
from __future__ import annotations

import re

# Words that say nothing about the product itself and may follow any name.
_NOISE = r"(?: (?:ישראל|ישראלי|מובחר|מובחרת|מובחרים|טרי|טריה|טריים|איכות|תפזורת|בתפזורת|במשקל|ק ג|קג|ארוז|ארוזה|\d{1,2}))*\.?"


def _rule(pid: str, name: str, stems: str, low: float, high: float, category: str = "produce") -> dict:
    return {
        "id": f"fresh-{pid}",
        "name": name,
        "category": category,
        "pattern": re.compile(rf"^(?:{stems}){_NOISE}$"),
        "low": low,
        "high": high,
    }


FRESH_PRODUCTS: list[dict] = [
    _rule("tomato", "עגבניה", "עגבניה|עגבניות|עגבנייה", 2, 25),
    _rule("cucumber", "מלפפון", "מלפפון|מלפפונים", 2, 25),
    _rule("onion", "בצל יבש", "בצל|בצל יבש|בצל צהוב", 1.5, 18),
    _rule("red-onion", "בצל אדום", "בצל אדום|בצל יבש אדום", 1.5, 18),
    _rule("carrot", "גזר", "גזר|גזר ארוז", 1.5, 15),
    _rule("potato", "תפוח אדמה לבן", "תפוא|תפוא לבן|תפוח אדמה|תפוח אדמה לבן", 1.5, 15),
    _rule("potato-red", "תפוח אדמה אדום", "תפוא אדום|תפוח אדמה אדום", 1.5, 15),
    _rule("sweet-potato", "בטטה", "בטטה|בטטות", 2, 20),
    _rule("pepper-red", "פלפל אדום", "פלפל אדום|גמבה אדומה|פלפל גמבה אדום", 4, 35),
    _rule("pepper-yellow", "פלפל צהוב", "פלפל צהוב|גמבה צהובה|פלפל גמבה צהוב", 4, 35),
    _rule("pepper-green", "פלפל ירוק", "פלפל ירוק|גמבה ירוקה", 4, 30),
    _rule("zucchini", "קישוא", "קישוא|קישואים", 2, 25),
    _rule("eggplant", "חציל", "חציל|חצילים", 2, 20),
    _rule("cabbage", "כרוב לבן", "כרוב|כרוב לבן", 1.5, 15),
    _rule("cauliflower", "כרובית", "כרובית", 3, 25),
    _rule("lettuce", "חסה", "חסה|חסה ערבית|חסה סלנובה", 3, 25),
    _rule("celery", "סלרי", "סלרי|סלרי ענף", 3, 25),
    _rule("garlic", "שום", "שום|שום יבש", 8, 70),
    _rule("lemon", "לימון", "לימון|לימונים", 2, 25),
    _rule("beet", "סלק", "סלק", 2, 15),
    _rule("pumpkin", "דלעת", "דלעת", 2, 15),
    _rule("banana", "בננה", "בננה|בננות", 3, 22),
    _rule("apple-red", "תפוח אדום", "תפוח אדום|תפוח עץ אדום|תפוח אדום יונתן|תפוח סטארקינג|תפוח עץ סטארקינג", 3, 28),
    _rule("apple-green", "תפוח ירוק", "תפוח ירוק|תפוח עץ ירוק|תפוח גרני סמית|תפוח גרנד", 3, 28),
    _rule("apple-pink", "תפוח פינק ליידי", "תפוח פינק ליידי|תפוח פינק|פינק ליידי", 4, 30),
    _rule("orange", "תפוז", "תפוז|תפוזים|תפוז סיני", 2, 20),
    _rule("clementine", "קלמנטינה", "קלמנטינה|קלמנטינות|קלמנטינה אור|אשכולית|מנדרינה", 3, 25),
    _rule("grapefruit", "אשכולית אדומה", "אשכולית אדומה|אשכולית", 2, 20),
    _rule("pear", "אגס", "אגס|אגסים", 4, 30),
    _rule("avocado", "אבוקדו", "אבוקדו|אבוקדו האס", 4, 35),
    _rule("persimmon", "אפרסמון", "אפרסמון", 3, 25),
    _rule("pomegranate", "רימון", "רימון|רימונים", 4, 30),
    _rule("mango", "מנגו", "מנגו", 5, 35),
    _rule("grapes", "ענבים", "ענבים|ענבים ירוקים|ענבים שחורים|ענב", 5, 40),
    _rule("kiwi", "קיווי", "קיווי|קיוי", 5, 35),
    _rule("chicken-breast", "חזה עוף טרי", "חזה עוף|חזה עוף טרי|חזה עוף שלם|חזה עוף שלם טרי", 18, 70, "meat"),
    _rule("chicken-thigh", "פרגית טריה", "פרגית|פרגיות|פרגית עוף|שיפוד פרגית", 25, 80, "meat"),
    _rule("chicken-drumstick", "שוקיים עוף טריות", "שוקיים|שוקיים עוף|שוק עוף|שוקי עוף", 10, 45, "meat"),
    _rule("chicken-wings", "כנפיים עוף טריות", "כנפיים|כנפיים עוף|כנפי עוף|כנפיים טרי", 8, 40, "meat"),
    _rule("chicken-whole", "עוף שלם טרי", "עוף שלם|עוף טרי|עוף שלם טרי", 8, 40, "meat"),
    _rule("salmon-fillet", "פילה סלמון קפוא", "פילה סלמון קפוא|פילה סלמון קפא|נתחי פילה סלמון|פילה סלמון", 45, 180, "meat"),
]


def match_fresh(normalized_name: str, is_weighted: bool, price: float) -> dict | None:
    """Return the fresh rule that this item satisfies, if exactly one does."""
    if not is_weighted:
        return None
    hits = [r for r in FRESH_PRODUCTS if r["pattern"].match(normalized_name)]
    if len(hits) != 1:
        return None
    rule = hits[0]
    return rule if rule["low"] <= price <= rule["high"] else None

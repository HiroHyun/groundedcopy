"""Cut the Chinese fonts down to the characters the page uses.

Usage: python3 scripts/subset_zh.py NotoSansSC[wght].ttf NotoSerifSC[wght].ttf

Needs fontTools and brotli. Download both files from Google Fonts (the google/fonts
repository, ofl/notosanssc and ofl/notoserifsc). Writes src/assets/fonts/NotoSansSC-subset.woff2
(weights 400 to 700) and NotoSerifSC-700-subset.woff2. Run it again after the Chinese copy
changes; a character missing from the subset falls back to the system font.
"""
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SITE = Path(__file__).resolve().parent.parent
CJK = re.compile(r"[　-〿㐀-䶿一-鿿＀-￯—…·]")


def characters():
    found = set()
    for path in (SITE / "src").rglob("*"):
        if path.suffix in {".ts", ".astro"}:
            found.update(CJK.findall(path.read_text(encoding="utf-8")))
    return "".join(sorted(found))


def cut(source, axes, text, out):
    font = instancer.instantiateVariableFont(TTFont(source), axes)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(out)
    return out.stat().st_size


def main(sans, serif):
    text = characters()
    assert len(text) > 100, "No Chinese text found under src/"
    fonts = SITE / "src/assets/fonts"
    a = cut(sans, {"wght": (400, 700)}, text, fonts / "NotoSansSC-subset.woff2")
    b = cut(serif, {"wght": 700}, text, fonts / "NotoSerifSC-700-subset.woff2")
    print("%d characters; sans %d bytes, serif %d bytes" % (len(text), a, b))


if __name__ == "__main__":
    main(*sys.argv[1:3])

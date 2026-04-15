#!/usr/bin/env python3
"""One-off: split js/learn.js embedded HANZI_META and CATEGORIES into public/data/*.json"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEARN_JS = ROOT / "js" / "learn.js"
OUT_DIR = ROOT / "data"

META_RE = re.compile(
    r"'([^']+)':\s*\{\s*pinyin:\s*'((?:\\.|[^'\\])*)',\s*meaning:\s*'((?:\\.|[^'\\])*)'\s*\}",
    re.DOTALL,
)


def unescape_js_str(s: str) -> str:
    return s.replace("\\'", "'").replace("\\\\", "\\")


def extract_bracketed(segment: str, open_ch: str, start: int = 0) -> tuple[str, int]:
    """Return substring from first `[` or `{` at start through matching close bracket; end index exclusive."""
    if start >= len(segment) or segment[start] != open_ch:
        raise ValueError("expected open bracket")
    close_ch = "]" if open_ch == "[" else "}"
    depth = 0
    i = start
    while i < len(segment):
        c = segment[i]
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return segment[start : i + 1], i + 1
        i += 1
    raise ValueError("unclosed bracket")


def parse_categories_arr(arr_txt: str) -> list[dict]:
    arr_txt = arr_txt.strip()
    if not (arr_txt.startswith("[") and arr_txt.endswith("]")):
        raise SystemExit("CATEGORIES must be [...]")
    inner = arr_txt[1:-1].strip()
    out: list[dict] = []
    pos = 0
    n = len(inner)
    while pos < n:
        while pos < n and inner[pos] in " \n\r\t,":
            pos += 1
        if pos >= n:
            break
        block, end = extract_bracketed(inner, "{", pos)
        id_m = re.search(r"id:\s*'([^']*)'", block)
        name_m = re.search(r"name:\s*'([^']*)'", block)
        emoji_m = re.search(r"emoji:\s*'([^']*)'", block)
        if not id_m or not name_m or not emoji_m:
            raise SystemExit("category field missing in block")
        chars_part = block[block.index("chars:") + len("chars:") :].lstrip()
        arr_s, _ = extract_bracketed(chars_part, "[", 0)
        chars = json.loads(arr_s)
        out.append(
            {"id": id_m.group(1), "name": name_m.group(1), "emoji": emoji_m.group(1), "chars": chars}
        )
        pos = end
    return out


def main() -> None:
    text = LEARN_JS.read_text(encoding="utf-8")
    j = text.find("\nconst CATEGORIES = ")
    if j < 0:
        raise SystemExit("marker not found: const CATEGORIES")
    meta_start = text.index("const HANZI_META = ")
    meta_block = text[meta_start + len("const HANZI_META = ") : j].strip()
    if meta_block.endswith(";"):
        meta_block = meta_block[:-1].strip()
    meta_block = meta_block.strip()
    if not meta_block.startswith("{"):
        raise SystemExit("HANZI_META parse error")

    hanzi_meta: dict[str, dict[str, str]] = {}
    for m in META_RE.finditer(meta_block):
        ch, py, mean = m.group(1), m.group(2), m.group(3)
        hanzi_meta[ch] = {"pinyin": unescape_js_str(py), "meaning": unescape_js_str(mean)}

    cat_start = text.index("const CATEGORIES = ", j)
    rest = text[cat_start + len("const CATEGORIES = ") :]
    end = rest.find("];\n\n//  应用状态")
    if end < 0:
        raise SystemExit("marker not found: app state")
    arr_txt = rest[: end + 1].strip()
    categories = parse_categories_arr(arr_txt)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "hanzi-meta.json").write_text(
        json.dumps(hanzi_meta, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (OUT_DIR / "categories.json").write_text(
        json.dumps(categories, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print("wrote", len(hanzi_meta), "chars,", len(categories), "categories ->", OUT_DIR)


if __name__ == "__main__":
    main()

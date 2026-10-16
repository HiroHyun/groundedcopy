"""Build the page's data and the download from the October 2026 run record.

Usage: python3 -I -B scripts/run_data.py PATH/TO/proof-publication/2026-10-13

Writes, relative to the site folder:
  src/data/run.json              totals, per-question counts, the featured question
  public/data/questions.json     each question's flagged sentences and an excerpt of both
                                 answers, loaded on demand
  public/data/answers-<site>.json  both full answers per question, loaded on demand
  public/record/<name>.zip       the record, byte for byte as its manifest lists it

The counts use the checker and the normaliser bundled in the record, so the page
shows the record's own figures. Standard library only.
"""
import hashlib
import importlib.util
import io
import json
import re
import sys
import zipfile
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ZIP_NAME = "grounded-copy-run-2026-10-13.zip"
FEATURED = ("parenting", 20350)
SITE_NAMES = {"cooking": "Cooking", "travel": "Travel", "money": "Money",
              "parenting": "Parenting", "diy": "DIY"}
SPLIT = re.compile(r'(?<=[.!?])["”’)]*\s+(?=[A-Z0-9“"(])')
# The checker reports phrases with straight quotes; the answers use curly ones.
FLAT = str.maketrans("‘’“”", "''\"\"")
STOP = set("the a an and or of to in on for is are be it this that with as at by from "
           "your you can if not but than rather more just its their they them was were "
           "has have had will would should could may might do does did so such into "
           "about over under out up".split())


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def recorded_bytes(path, digest):
    """The file's bytes as the manifest records them.

    A git checkout can store a CRLF file with LF endings. Restore CRLF only when
    that reproduces the recorded hash; any other difference stops the build.
    """
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() == digest:
        return data
    crlf = data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    assert hashlib.sha256(crlf).hexdigest() == digest, "Hash mismatch: %s" % path
    return crlf


def sentences(text):
    return [s.strip() for para in text.split("\n\n") for s in SPLIT.split(para) if s.strip()]


def marked(text, findings):
    """[{s: sentence, m: [[start, end], ...]}] for the sentences holding findings."""
    found = {}
    for sentence in sentences(text):
        for _, _, snippet in findings:
            at = sentence.translate(FLAT).find(snippet.translate(FLAT))
            if at >= 0:
                spans = found.setdefault(sentence, [])
                if [at, at + len(snippet)] not in spans:
                    spans.append([at, at + len(snippet)])
    return [{"s": s, "m": sorted(m)} for s, m in found.items()]


def words(sentence):
    return {w for w in re.findall(r"[a-z0-9']+", sentence.lower()) if w not in STOP and len(w) > 2}


def counterpart(sentence, text, other):
    """The sentence of `other` that makes the point `sentence` makes in `text`: the one
    sharing the most words, or, when none shares enough, the one at the same place."""
    candidates = sentences(other)
    own = words(sentence)
    score = lambda c: len(own & words(c)) / (len(own | words(c)) or 1)
    best = max(candidates, key=score)
    if score(best) >= 0.15:
        return best
    target = text.find(sentence) / len(text) * len(other)
    return next((c for c in candidates if other.find(c) >= target), candidates[-1])


def cut(text, n, keep):
    """`text` cut at a space to about n characters, keeping its start or its end, with an
    ellipsis where it was cut."""
    if len(text) <= n:
        return text
    if keep == "start":
        return text[:text.rfind(" ", 0, n)].rstrip(",;:") + "…"
    return "…" + text[text.find(" ", len(text) - n) + 1:]


def excerpt(text, sentence, spans):
    """The answer around `sentence`. `b` ends with the text before it in its paragraph and
    `a` starts with the text after it; a neighbouring paragraph joins when that is short."""
    paras = text.split("\n\n")
    i = next(n for n, para in enumerate(paras) if sentence in para)
    at = paras[i].find(sentence)
    before = [cut(paras[i][:at].strip(), 120, "end")]
    after = [cut(paras[i][at + len(sentence):].strip(), 180, "start")]
    if len(before[0]) < 50 and i > 0:
        before.insert(0, cut(paras[i - 1], 120, "end"))
    if len(after[0]) < 100 and i + 1 < len(paras):
        after.append(cut(paras[i + 1], 140, "start"))
    return {"w": len(text.split()), "b": before, "s": sentence, "m": spans, "a": after}


def blocks(markdown):
    """An answer as paragraphs, list items and tables, with Markdown marks removed.

    A link keeps its text. The record holds every answer with its links.
    """
    clean = lambda text: re.sub(r"\[([^\]]+)\]\([^)\s]+\)", r"\1", re.sub(r"\*\*|__|`", "", text)).strip()
    out, para, table = [], [], []

    def flush():
        if para:
            out.append({"p": " ".join(para)})
            para.clear()
        if table:
            out.append({"table": list(table)})
            table.clear()

    for line in markdown.splitlines():
        item = re.match(r"\s*(?:[-*+]|\d+\.)\s+(.*)", line)
        if not line.strip():
            flush()
        elif line.lstrip().startswith("|"):
            if para:
                flush()
            cells = [clean(c) for c in line.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                table.append(cells)
        elif item:
            flush()
            out.append({"li": clean(item.group(1))})
        else:
            if table:
                flush()
            para.append(clean(re.sub(r"^#+\s*", "", line)))
    flush()
    return out


def _check_blocks():
    md = "Intro with a [link](https://x.y/z).\n\n| A | B |\n|---|---|\n| **1** | 2 |\n\n- one\n  - two\nTail"
    assert blocks(md) == [{"p": "Intro with a link."}, {"table": [["A", "B"], ["1", "2"]]},
                          {"li": "one"}, {"li": "two"}, {"p": "Tail"}], blocks(md)


def main(bundle):
    _check_blocks()
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    files = {name: recorded_bytes(bundle / name, digest) for name, digest in sorted(manifest["files"].items())}
    files["manifest.json"] = (bundle / "manifest.json").read_bytes()

    lint = load("copy_lint", bundle / "tools/copy_lint.py")
    paragraphs = load("normalize", bundle / "tools/normalize.py").paragraphs
    results = json.loads(files["results.json"])
    questions = rows(bundle / "data/questions.jsonl")
    answers = {label: {(r["site"], r["question_id"]): r for r in rows(bundle / ("data/raw-%s.jsonl" % label))}
               for label in ("off", "on")}

    compact, details, full = [], {}, {}
    for q in questions:
        key = (q["site"], q["question_id"])
        text = {label: "\n\n".join(paragraphs(answers[label][key]["answer"])) for label in ("off", "on")}
        found = {label: lint.scan_text(text[label], "chat") for label in ("off", "on")}
        compact.append([list(SITE_NAMES).index(q["site"]), q["question_id"], len(found["off"]), len(found["on"])])
        flagged = {label: marked(text[label], found[label]) for label in ("off", "on")}
        assert all(bool(flagged[label]) == bool(found[label]) for label in ("off", "on")), key
        # Each side shows its first flagged sentence, else the sentence making the same point
        # as the other side's, else its opening.
        key_sentence = {label: flagged[label][0]["s"] if flagged[label] else None for label in ("off", "on")}
        for label, other in (("off", "on"), ("on", "off")):
            if not key_sentence[label]:
                key_sentence[label] = (counterpart(key_sentence[other], text[other], text[label])
                                       if flagged[other] else sentences(text[label])[0])
        attribution = q["attribution"]
        details["%s-%d" % key] = {
            "t": q["title"], "u": attribution["source_url"], "au": attribution["author_url"],
            "a": attribution["author_id"], "l": attribution["licence"], "lu": attribution["licence_url"],
            "off": flagged["off"], "on": flagged["on"],
            "x": {label: excerpt(text[label], key_sentence[label],
                                 flagged[label][0]["m"] if flagged[label] else []) for label in ("off", "on")},
        }
        full.setdefault(q["site"], {})["%s-%d" % key] = {
            label: blocks(answers[label][key]["answer"]) for label in ("off", "on")}

    flagged = {label: sum(1 for c in compact if c[2 if label == "off" else 3]) for label in ("off", "on")}
    assert flagged["off"] == results["paired_300"]["off"]["checker_flagged_answers"] == 191
    assert flagged["on"] == results["paired_300"]["on"]["checker_flagged_answers"] == 42
    assert sum(c[2] for c in compact) == results["paired_300"]["off"]["checker_findings"]
    assert sum(c[3] for c in compact) == results["paired_300"]["on"]["checker_findings"]

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo("grounded-copy-run-2026-10-13/" + name, date_time=(2026, 10, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, data)

    (SITE / "public/record").mkdir(parents=True, exist_ok=True)
    (SITE / "public/record" / ZIP_NAME).write_bytes(archive.getvalue())
    out = SITE / "public/data"
    out.mkdir(parents=True, exist_ok=True)
    dump = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    (out / "questions.json").write_text(dump(details), encoding="utf-8")
    for site, values in full.items():
        (out / ("answers-%s.json" % site)).write_text(dump(values), encoding="utf-8")

    p300, p100 = results["paired_300"], results["paired_100"]
    run = {
        "sites": [{"id": s, "name": n} for s, n in SITE_NAMES.items()],
        "questions": compact,
        "featured": dict(details["%s-%d" % FEATURED], site=FEATURED[0], id=FEATURED[1]),
        "zip": {"name": ZIP_NAME, "bytes": len(archive.getvalue()), "files": len(files)},
        "totals": {
            "questions": len(compact),
            "flagged": flagged,
            "onlyOff": sum(1 for c in compact if c[2] and not c[3]),
            "onlyOn": sum(1 for c in compact if c[3] and not c[2]),
            "peoplePct": results["human"]["checker_flagged_pct"],
            "peopleAnswers": results["human"]["answers"],
            "words": {"off": p300["off"]["prose_words_per_answer"], "on": p300["on"]["prose_words_per_answer"]},
            "seconds": {k: p100[k]["recorded_path_seconds_median"] for k in ("off", "on", "hz")},
            "tokens": {k: p100[k]["logged_tokens_per_finished_answer"] for k in ("off", "on", "hz")},
            "secondsSum": {k: p100[k]["recorded_path_seconds_sum"] for k in ("off", "hz")},
        },
    }
    (SITE / "src/data/run.json").write_text(json.dumps(run, ensure_ascii=False, indent=1), encoding="utf-8")
    print("questions %d, flagged off %d on %d, zip %d bytes, %d files"
          % (len(compact), flagged["off"], flagged["on"], len(archive.getvalue()), len(files)))


if __name__ == "__main__":
    main(Path(sys.argv[1]))

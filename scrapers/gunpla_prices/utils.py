import re
from typing import Iterable, List

def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

def grade_abbr(grade: str | None) -> str:
    m = {
        "High Grade (HG)": "hg",
        "Real Grade (RG)": "rg",
        "Master Grade (MG)": "mg",
        "Perfect Grade (PG)": "pg",
        "Full Mechanics (FM)": "fm",
        "Super Deformed (SD)": "sd",
    }
    return m.get(grade or "", "")

def tokenize(name: str, grade: str | None = None, model_code: str | None = None, scale: str | None = None) -> List[str]:
    toks = normalize(name).split()
    out: List[str] = []
    ab = grade_abbr(grade)
    if ab:
        out.append(ab)
    out += toks
    if model_code:
        out.append(model_code.lower())
    if scale:
        out.append(scale.lower())
    # Unique order-preserving
    seen = set()
    uniq = []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq

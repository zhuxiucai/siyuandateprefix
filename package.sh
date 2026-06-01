#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-package.zip}"
python3 - <<PY
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
files=["plugin.json","index.js","index.css","README.md","README_zh_CN.md","LICENSE","icon.png","preview.png"]
out=Path("$OUT")
with ZipFile(out,"w",ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, arcname=f)
print(f"Package written to: {out}")
PY

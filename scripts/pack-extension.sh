#!/usr/bin/env bash
# Empaqueta la extensión de Meet en public/downloads/scrum-proshop-meet-extension.zip (la que se descarga desde /extension-authorize).
# Uso: bash scripts/pack-extension.sh   (hay que correrlo y subir el .zip cuando cambie algo en extensions/meet)
set -euo pipefail
cd "$(dirname "$0")/../extensions/meet"
out="../../public/downloads/scrum-proshop-meet-extension.zip"
mkdir -p "$(dirname "$out")"
rm -f "$out"
if command -v zip >/dev/null; then
  zip -qr "$out" . -x "README.md" "STORE-LISTING.md" ".DS_Store"
else
  python3 - "$out" <<'PY'
import sys, zipfile, os
out = sys.argv[1]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("."):
        for f in files:
            if f in ("README.md", "STORE-LISTING.md", ".DS_Store"): continue
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, "."))
PY
fi
echo "Listo: $out ($(du -h "$out" | cut -f1))"
